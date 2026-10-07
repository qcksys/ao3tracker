import { createDbConnection, type TDatabase } from "~/db/db.client";
import { resetWorkAvailabilityNotifications } from "~/db/queries/notification";
import { markWorkAsPrivate, migrateSingleChapterTracking } from "~/db/queries/track";
import { findMissingTrackedWorks, upsertWork } from "~/db/queries/work";
import type { TWorkI } from "~/db/schema/work";
import { sleep } from "~/lib/ao3-fetch";
import { createWorkNotifications } from "~/lib/notification-service";
import { DELAY_BETWEEN_REQUESTS_MS } from "~/scheduled/helpers";
import {
  fetchWorksBatch,
  saveWorkRelations,
  type WorkProcessResult,
} from "~/scheduled/work-fetcher";

const MAX_WORKS_PER_RUN = 12;
const PARALLEL_REQUESTS = 4;

/**
 * Main scheduled handler for fetching missing tracked works
 */
export async function fetchMissingWorks(env: CloudflareBindings): Promise<void> {
  const db = createDbConnection(env.DATABASE_URL);

  // Find tracked works that don't exist in the works table
  const missingWorks = await findMissingTrackedWorks(db, MAX_WORKS_PER_RUN);

  console.log({
    message: "Found missing works to fetch",
    count: missingWorks.length,
    works: missingWorks,
  });

  // Process in batches of PARALLEL_REQUESTS
  for (let i = 0; i < missingWorks.length; i += PARALLEL_REQUESTS) {
    const batch = missingWorks.slice(i, i + PARALLEL_REQUESTS).map((w) => w.workId);

    console.log({
      message: "Processing batch of missing works",
      start: i,
      size: batch.length,
      works: batch,
    });

    const results = await fetchWorksBatch(batch);

    // Process results and save to DB
    for (const result of results) {
      await handleFetchResult(db, env, result);
    }

    // Delay between batches to avoid rate limiting
    if (i + PARALLEL_REQUESTS < missingWorks.length) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log({ message: "Scheduled missing works fetch completed" });
}

/**
 * Handle the result of fetching a work
 */
async function handleFetchResult(
  db: TDatabase,
  env: CloudflareBindings,
  result: WorkProcessResult,
): Promise<void> {
  if (!result.success) {
    if (result.notFound) {
      console.log({
        message: "Work not found (deleted from AO3), creating soft-deleted placeholder",
        workId: result.workId,
      });
      // Create a soft-deleted placeholder so we don't keep trying to fetch it
      // The track remains unchanged
      await upsertWork(db, {
        id: result.workId,
        title: "[Deleted]",
        author: "[Deleted]",
        language: "Unknown",
        wordCount: 0,
        currentChapters: 0,
        hits: 0,
        kudos: 0,
        bookmarks: 0,
        comments: 0,
        published: new Date(),
        lastUpdated: new Date(),
        rowDeletedAt: new Date(),
      });

      // Notify users tracking this work that it was deleted
      await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
        workId: result.workId,
        workTitle: "[Deleted]",
        type: "work_deleted",
      });
    } else if (result.restrictedWork) {
      console.log({
        message: "Work requires login, marking as private",
        workId: result.workId,
      });
      await markWorkAsPrivate(db, result.workId);

      // Notify users tracking this work that it became restricted
      await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
        workId: result.workId,
        workTitle: "[Restricted]",
        type: "work_restricted",
      });
    } else {
      console.error({
        message: "Failed to fetch work",
        workId: result.workId,
        error: result.error,
      });
    }
    return;
  }

  if (!result.data) {
    console.error({
      message: "No data returned for work",
      workId: result.workId,
    });
    return;
  }

  const { workInfo, parsed, chapters } = result.data;

  // Insert work record (use lastUpdated as fallback for published date)
  const workInsertData: TWorkI = {
    id: result.workId,
    title: workInfo.workName || "Unknown",
    author: workInfo.authorName || "Unknown",
    authorUrl: workInfo.authorUrl,
    summary: workInfo.summary,
    language: workInfo.language || "Unknown",
    wordCount: parsed.wordCount,
    currentChapters: parsed.currentChapters,
    totalChapters: parsed.totalChapters,
    hits: parsed.hits,
    kudos: parsed.kudos,
    bookmarks: parsed.bookmarks,
    comments: parsed.comments,
    published: parsed.lastUpdated || new Date(),
    lastUpdated: parsed.lastUpdated || new Date(),
    downloadPath: workInfo.downloadPath,
    downloadUpdatedAt: workInfo.downloadUpdatedAt,
  };
  await upsertWork(db, workInsertData);
  await resetWorkAvailabilityNotifications(db, result.workId);

  // Save tags and chapters
  await saveWorkRelations(db, result.workId, result.data);

  // If work has 2+ chapters, migrate any chapterId=0 tracking records.
  // This handles edge case where user tracked when single-chapter but
  // work gained chapters before we fetched it.
  if (parsed.currentChapters > 1 && chapters.length > 0) {
    const firstChapterId = chapters[0].id;
    const migratedCount = await migrateSingleChapterTracking(db, result.workId, firstChapterId);
    if (migratedCount > 0) {
      console.log({
        message: "Migrated single-chapter tracking records",
        workId: result.workId,
        firstChapterId,
        migratedCount,
      });
    }
  }

  console.log({
    message: "Work fetched and inserted successfully",
    workId: result.workId,
  });
}
