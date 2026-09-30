import { subHours } from "date-fns";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";
import { createDbConnection, type TDatabase } from "~/db/db.client";
import { findLatestBackupUpdatedAt, upsertBackup } from "~/db/queries/backup";
import { migrateSingleChapterTracking } from "~/db/queries/track";
import {
  findStaleWorks,
  getWorkState,
  softDeleteWork,
  touchWorkRefreshed,
  updateWork,
  type WorkUpdateData,
} from "~/db/queries/work";
import { type BackupFormat, backupFormats } from "~/db/schema/work.backup";
import { sleep } from "~/lib/ao3-fetch";
import type { WorkInfo } from "~/lib/ao3-parser";
import { createWorkNotifications } from "~/lib/notification-service";
import { DELAY_BETWEEN_REQUESTS_MS } from "~/scheduled/helpers";
import {
  fetchWorksBatch,
  type ParsedWorkData,
  saveWorkRelations,
  type WorkProcessResult,
} from "~/scheduled/work-fetcher";

const STALE_THRESHOLD_HOURS = 6;
const MAX_WORKS_PER_RUN = 12;
const PARALLEL_REQUESTS = 4;

/**
 * Download a work from AO3 and store in R2
 */
export async function downloadAndBackupWork(
  db: TDatabase,
  env: CloudflareBindings,
  workId: number,
  workInfo: WorkInfo,
): Promise<void> {
  if (!workInfo.downloadPath || !workInfo.downloadUpdatedAt) {
    console.log({ message: "Skipping download, no download info", workId });
    return;
  }

  console.log({
    message: "Downloading work",
    workId,
    downloadPath: workInfo.downloadPath,
    downloadUpdatedAt: workInfo.downloadUpdatedAt,
  });

  // Download all formats
  for (const format of backupFormats.filter((f) => ["epub", "html"].includes(f))) {
    try {
      const latestBackupUpdatedAt = await findLatestBackupUpdatedAt(db, workId, format);
      if (latestBackupUpdatedAt !== null && latestBackupUpdatedAt >= workInfo.downloadUpdatedAt) {
        continue;
      }
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
      await downloadWorkFormat(
        db,
        env,
        workId,
        workInfo.downloadPath,
        workInfo.downloadUpdatedAt,
        format,
      );
    } catch (error) {
      console.error({
        message: "Failed to download work format",
        workId,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Download a specific format of a work
 */
async function downloadWorkFormat(
  db: TDatabase,
  env: CloudflareBindings,
  workId: number,
  downloadPath: string,
  downloadUpdatedAt: Date,
  format: BackupFormat,
): Promise<void> {
  const downloadUpdatedAtUnix = Math.floor(downloadUpdatedAt.getTime() / 1000);
  const url = `${AO3_BASE_URL}/downloads/${workId}/${downloadPath}.${format}?updated_at=${downloadUpdatedAtUnix}`;

  const startTime = performance.now();
  const response = await fetch(url, {
    headers: {
      "User-Agent": AO3_USER_AGENT,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    console.error({
      message: "Failed to download work format",
      workId,
      format,
      status: response.status,
      requestTimeMs: Math.round(performance.now() - startTime),
    });
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const fileContent = await response.arrayBuffer();
  const requestTimeMs = Math.round(performance.now() - startTime);
  const r2Key = `${workId}/${downloadUpdatedAt.getTime()}.${format}`;

  const backupSuccess = await env.WORK_BACKUPS_BUCKET.put(r2Key, fileContent);
  if (!backupSuccess) {
    throw new Error("Failed to store backup in R2");
  }

  await upsertBackup(db, {
    workId,
    format,
    r2Key,
    fileSize: fileContent.byteLength,
    ao3UpdatedAt: downloadUpdatedAt,
  });

  console.log({
    message: "Work format backed up",
    workId,
    format,
    r2Key,
    fileSize: fileContent.byteLength,
    requestTimeMs,
  });
}

/**
 * Process a successful fetch result - update DB and optionally backup
 */
async function processRefreshResult(
  db: TDatabase,
  env: CloudflareBindings,
  workId: number,
  data: ParsedWorkData,
): Promise<void> {
  const { workInfo, parsed, chapters } = data;

  // Get old work state before updating (for notification comparison)
  const oldState = await getWorkState(db, workId);
  const oldChapterCount = oldState?.currentChapters ?? null;
  const wasComplete =
    oldState !== null &&
    oldState.totalChapters !== null &&
    oldState.currentChapters === oldState.totalChapters;

  // Update work record
  const workUpdateData: WorkUpdateData = {
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
    lastUpdated: parsed.lastUpdated || new Date(),
    downloadPath: workInfo.downloadPath,
    downloadUpdatedAt: workInfo.downloadUpdatedAt,
  };
  await updateWork(db, workId, workUpdateData);

  // Save tags and chapters
  await saveWorkRelations(db, workId, data);

  // If work went from single-chapter (1) to multi-chapter (2+),
  // migrate tracking records from chapterId=0 to actual first chapter ID
  if (oldChapterCount === 1 && parsed.currentChapters > 1 && chapters.length > 0) {
    const firstChapterId = chapters[0].id;
    const migratedCount = await migrateSingleChapterTracking(db, workId, firstChapterId);
    if (migratedCount > 0) {
      console.log({
        message: "Migrated single-chapter tracking records",
        workId,
        firstChapterId,
        migratedCount,
      });
    }
  }

  // Download and backup work if needed
  await downloadAndBackupWork(db, env, workId, workInfo);

  // Create notifications for work updates
  const workTitle = workInfo.workName || oldState?.title || "Unknown";
  const isNowComplete =
    parsed.totalChapters !== null && parsed.currentChapters === parsed.totalChapters;

  // Debug: Log notification condition check
  console.log({
    message: "Checking notification conditions",
    workId,
    oldChapterCount,
    newChapterCount: parsed.currentChapters,
    hasOldState: oldState !== null,
    shouldNotify: oldChapterCount !== null && parsed.currentChapters > oldChapterCount,
  });

  // Notify for new chapters
  if (oldChapterCount !== null && parsed.currentChapters > oldChapterCount) {
    await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
      workId,
      workTitle,
      type: "new_chapters",
      oldChapters: oldChapterCount,
      newChapters: parsed.currentChapters,
      totalChapters: parsed.totalChapters,
    });
  }

  // Notify for work completion (only if it just became complete)
  if (!wasComplete && isNowComplete) {
    await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
      workId,
      workTitle,
      type: "work_completed",
      newChapters: parsed.currentChapters,
      totalChapters: parsed.totalChapters,
    });
  }

  console.log({ message: "Work refreshed successfully", workId });
}

/**
 * Handle the result of fetching a work for refresh
 */
async function handleRefreshResult(
  db: TDatabase,
  env: CloudflareBindings,
  result: WorkProcessResult,
): Promise<void> {
  if (!result.success) {
    // Get work state for notification (need title before soft-delete)
    const workState = await getWorkState(db, result.workId);
    const workTitle = workState?.title || "Unknown Work";

    if (result.notFound) {
      console.log({
        message: "Work not found (deleted from AO3), soft-deleting",
        workId: result.workId,
      });

      // Notify users before soft-deleting
      await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
        workId: result.workId,
        workTitle,
        type: "work_deleted",
      });

      await softDeleteWork(db, result.workId);
    } else if (result.restrictedWork) {
      console.log({
        message: "Work became restricted, soft-deleting and notifying users",
        workId: result.workId,
      });

      await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
        workId: result.workId,
        workTitle,
        type: "work_restricted",
      });

      // Soft-delete so the work stops being refreshed (same as deleted works)
      await softDeleteWork(db, result.workId);
    } else {
      console.error({
        message: "Failed to refresh work",
        workId: result.workId,
        error: result.error,
      });

      // Update lastRefreshed to prevent immediate re-processing on transient errors
      await touchWorkRefreshed(db, result.workId);
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

  await processRefreshResult(db, env, result.workId, result.data);
}

/**
 * Main scheduled handler for refreshing stale works
 */
export async function refreshStaleWorks(env: CloudflareBindings): Promise<void> {
  const db = createDbConnection(env.DATABASE_URL);

  const staleThreshold = subHours(new Date(), STALE_THRESHOLD_HOURS);

  // Find works that haven't been updated in the last 24 hours
  const staleWorks = await findStaleWorks(db, staleThreshold, MAX_WORKS_PER_RUN);

  console.log({
    message: "Found stale works to refresh",
    count: staleWorks.length,
    works: staleWorks.map((w) => w.id),
  });

  // Process in batches of PARALLEL_REQUESTS
  for (let i = 0; i < staleWorks.length; i += PARALLEL_REQUESTS) {
    const batch = staleWorks.slice(i, i + PARALLEL_REQUESTS);
    const workIds = batch.map((w) => w.id);

    // Build map of known chapter counts for optimization
    const knownChapterCounts = new Map<number, number>();
    for (const work of batch) {
      if (work.currentChapters !== null) {
        knownChapterCounts.set(work.id, work.currentChapters);
      }
    }

    console.log({
      message: "Processing batch of stale works",
      start: i,
      size: batch.length,
      works: batch.map((w) => w.id),
    });

    const results = await fetchWorksBatch(workIds, knownChapterCounts);

    // Process results sequentially (backup downloads need to be rate-limited)
    for (const result of results) {
      await handleRefreshResult(db, env, result);
    }

    // Delay between batches to avoid rate limiting
    if (i + PARALLEL_REQUESTS < staleWorks.length) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log({ message: "Scheduled work refresh completed" });
}
