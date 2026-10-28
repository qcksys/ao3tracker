import { addMinutes, subHours } from "date-fns";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";
import { createDbConnection, type TDatabase } from "~/db/db.client";
import { findLatestBackupUpdatedAt, upsertBackup } from "~/db/queries/backup";
import { resetWorkAvailabilityNotifications } from "~/db/queries/notification";
import { migrateSingleChapterTracking } from "~/db/queries/track";
import {
  claimStaleWorks,
  getWorkState,
  recordWorkRefreshFailure,
  softDeleteWork,
  updateWork,
  type WorkUpdateData,
} from "~/db/queries/work";
import type { BackupFormat } from "~/db/schema/work.backup";
import { sleep } from "~/lib/ao3-fetch";
import type { WorkInfo } from "~/lib/ao3-parser";
import { createWorkNotifications } from "~/lib/notification-service";
import { DELAY_BETWEEN_REQUESTS_MS } from "~/scheduled/helpers";
import {
  fetchWorkDataSafe,
  type ParsedWorkData,
  saveWorkRelations,
  type WorkProcessResult,
} from "~/scheduled/work-fetcher";

export const STALE_THRESHOLD_HOURS = 6;
const RETRY_BASE_DELAY_MINUTES = 30;
const MAX_WORKS_PER_RUN = 12;
/** Shorter than the 5-minute cron interval, so consecutive runs do not overlap */
const RUN_BUDGET_MS = 4 * 60 * 1000;

/**
 * Minutes until a work is retried after its nth consecutive failed refresh: 30m, 1h, 2h, 4h, then
 * the normal refresh interval. A claimed work that is never processed uses the first delay.
 */
export function refreshRetryDelayMinutes(failures: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MINUTES * 2 ** Math.max(failures - 1, 0),
    STALE_THRESHOLD_HOURS * 60,
  );
}

/** Formats downloaded from AO3 and backed up */
export const ao3BackupFormats = ["html", "epub"] as const satisfies readonly BackupFormat[];

/**
 * Claim up to `limit` stale works for refresh. A claimed work that is never processed is retried
 * after the first backoff delay.
 */
export function claimWorksForRefresh(
  db: TDatabase,
  limit: number,
): ReturnType<typeof claimStaleWorks> {
  const staleThreshold = subHours(new Date(), STALE_THRESHOLD_HOURS);
  return claimStaleWorks(
    db,
    staleThreshold,
    addMinutes(staleThreshold, refreshRetryDelayMinutes(1)),
    limit,
  );
}

/**
 * Whether the latest active backup of a format already covers a download revision
 */
export async function isBackupCurrent(
  db: TDatabase,
  workId: number,
  format: BackupFormat,
  downloadUpdatedAt: Date,
): Promise<boolean> {
  const latestBackupUpdatedAt = await findLatestBackupUpdatedAt(db, workId, format);
  return latestBackupUpdatedAt !== null && latestBackupUpdatedAt >= downloadUpdatedAt;
}

/**
 * AO3 download URL for one format of a download revision
 */
export function backupDownloadUrl(
  workId: number,
  downloadPath: string,
  downloadUpdatedAt: Date,
  format: BackupFormat,
): string {
  const downloadUpdatedAtUnix = Math.floor(downloadUpdatedAt.getTime() / 1000);
  return `${AO3_BASE_URL}/downloads/${workId}/${downloadPath}.${format}?updated_at=${downloadUpdatedAtUnix}`;
}

/**
 * Store a downloaded format in R2 and record the backup
 */
export async function storeWorkBackup(
  db: TDatabase,
  env: CloudflareBindings,
  workId: number,
  format: BackupFormat,
  downloadUpdatedAt: Date,
  fileContent: ArrayBuffer,
): Promise<string> {
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
  return r2Key;
}

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
  for (const format of ao3BackupFormats) {
    try {
      if (await isBackupCurrent(db, workId, format, workInfo.downloadUpdatedAt)) {
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
  const url = backupDownloadUrl(workId, downloadPath, downloadUpdatedAt, format);

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
  const r2Key = await storeWorkBackup(db, env, workId, format, downloadUpdatedAt, fileContent);

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

  // Persist update events before advancing the metadata used to detect them.
  const workTitle = workInfo.workName || oldState?.title || "Unknown";
  const isNowComplete =
    parsed.totalChapters !== null && parsed.currentChapters === parsed.totalChapters;
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
  if (!wasComplete && isNowComplete) {
    await createWorkNotifications(db, env.NOTIFICATION_QUEUE, {
      workId,
      workTitle,
      type: "work_completed",
      newChapters: parsed.currentChapters,
      totalChapters: parsed.totalChapters,
    });
  }

  // Advance metadata after notification persistence succeeds.
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
  await resetWorkAvailabilityNotifications(db, workId);

  // Save tags and chapters
  await saveWorkRelations(db, workId, data);

  // Also repair chapterId=0 records uploaded by clients during an earlier refresh.
  if (parsed.currentChapters > 1 && chapters.length > 0) {
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

  console.log({ message: "Work refreshed successfully", workId });
}

/**
 * Handle the result of fetching a work for refresh. Backups are left to the caller, which knows
 * how to reach AO3.
 */
export async function handleRefreshResult(
  db: TDatabase,
  env: CloudflareBindings,
  previousFailures: number,
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
      const failures = previousFailures + 1;
      const retryAt = addMinutes(
        subHours(new Date(), STALE_THRESHOLD_HOURS),
        refreshRetryDelayMinutes(failures),
      );
      await recordWorkRefreshFailure(db, result.workId, failures, retryAt);
      console.error({
        message: "Failed to refresh work",
        workId: result.workId,
        error: result.error,
        failures,
        retryAt,
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

  await processRefreshResult(db, env, result.workId, result.data);
}

/**
 * Main scheduled handler for refreshing stale works
 */
export async function refreshStaleWorks(env: CloudflareBindings): Promise<void> {
  const db = createDbConnection(env.DATABASE_URL);
  const startedAt = Date.now();
  let refreshed = 0;

  // Fetch one work at a time, and stop claiming once the budget is spent so this run ends before
  // the next cron run starts; overlapping runs would send AO3 parallel requests again.
  while (refreshed < MAX_WORKS_PER_RUN && Date.now() - startedAt < RUN_BUDGET_MS) {
    const [work] = await claimWorksForRefresh(db, 1);
    if (!work) break;

    const result = await fetchWorkDataSafe(work.id, { knownChapterCount: work.currentChapters });
    await handleRefreshResult(db, env, work.refreshFailures, result);
    if (result.success && result.data) {
      await downloadAndBackupWork(db, env, work.id, result.data.workInfo);
    }
    refreshed++;

    if (result.unavailable) {
      console.warn({
        message: "AO3 unavailable, stopping work refresh run",
        workId: work.id,
        error: result.error,
      });
      break;
    }
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log({ message: "Scheduled work refresh completed", refreshed });
}
