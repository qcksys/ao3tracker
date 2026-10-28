/**
 * Server side of the self-hosted browser work checker. The checker loads AO3 pages in a real
 * browser and polls this Worker for settings and jobs; the Worker never contacts it.
 */

import {
  type WorkCheckerBackupFormat,
  type WorkCheckerBackupOutcome,
  type WorkCheckerBackupRequest,
  type WorkCheckerJob,
  type WorkCheckerResult,
  type WorkCheckerResultResponse,
  type WorkCheckerSettings,
  workCheckerSettingsSchema,
} from "@qcksys/ao3tracker-core/work-checker";
import type { TDatabase } from "~/db/db.client";
import { findMissingTrackedWorks, getWorkCheckState } from "~/db/queries/work";
import { handleFetchResult } from "~/scheduled/fetch-missing-works";
import {
  ao3BackupFormats,
  backupDownloadUrl,
  claimWorksForRefresh,
  handleRefreshResult,
  isBackupCurrent,
  storeWorkBackup,
} from "~/scheduled/refresh-works";
import {
  completeWorkData,
  parseWorkPageHtml,
  type WorkProcessResult,
} from "~/scheduled/work-fetcher";

export function workCheckerSettings(
  env: Pick<CloudflareBindings, "WORK_CHECKER_SETTINGS">,
): WorkCheckerSettings {
  return workCheckerSettingsSchema.parse(env.WORK_CHECKER_SETTINGS);
}

/**
 * Hand out up to `limit` works: tracked works missing from the works table first, then stale
 * works, which are leased exactly as the scheduled refresh leases them. Missing works are not
 * leased, so run a single checker.
 */
export async function claimWorkCheckerJobs(
  db: TDatabase,
  limit: number,
): Promise<WorkCheckerJob[]> {
  const missing = await findMissingTrackedWorks(db, limit);
  const jobs: WorkCheckerJob[] = missing.map(({ workId }) => ({ workId, kind: "missing" }));
  if (jobs.length < limit) {
    const stale = await claimWorksForRefresh(db, limit - jobs.length);
    jobs.push(...stale.map(({ id }) => ({ workId: id, kind: "refresh" as const })));
  }
  return jobs;
}

async function toProcessResult(
  result: WorkCheckerResult,
  knownChapterCount: number | undefined,
): Promise<WorkProcessResult | "needs_chapter_index"> {
  const { workId } = result;
  switch (result.outcome) {
    case "not_found":
      return { workId, success: false, notFound: true };
    case "restricted":
      return { workId, success: false, restrictedWork: true };
    case "unavailable":
      return { workId, success: false, unavailable: true, error: result.error };
    case "failed":
      return { workId, success: false, error: result.error };
    case "page": {
      try {
        const page = await parseWorkPageHtml(workId, result.workHtml, { knownChapterCount });
        if (page.needsChapterIndex && result.chapterIndexHtml === undefined) {
          return "needs_chapter_index";
        }
        const data = await completeWorkData(workId, page, result.chapterIndexHtml ?? null);
        return { workId, success: true, data };
      } catch (error) {
        return {
          workId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
}

async function pendingBackups(
  db: TDatabase,
  result: WorkProcessResult,
): Promise<WorkCheckerBackupRequest[]> {
  const workInfo = result.data?.workInfo;
  if (!workInfo?.downloadPath || !workInfo.downloadUpdatedAt) return [];
  const { downloadPath, downloadUpdatedAt } = workInfo;

  const backups: WorkCheckerBackupRequest[] = [];
  for (const format of ao3BackupFormats) {
    if (await isBackupCurrent(db, result.workId, format, downloadUpdatedAt)) continue;
    backups.push({
      format,
      url: backupDownloadUrl(result.workId, downloadPath, downloadUpdatedAt, format),
      downloadUpdatedAt: Math.floor(downloadUpdatedAt.getTime() / 1000),
    });
  }
  return backups;
}

/**
 * Apply a page the checker loaded, through the same handlers the scheduled jobs use. A stored
 * work is a refresh; any other work is a missing tracked work.
 */
export async function applyWorkCheckerResult(
  db: TDatabase,
  env: CloudflareBindings,
  result: WorkCheckerResult,
): Promise<WorkCheckerResultResponse> {
  const state = await getWorkCheckState(db, result.workId);
  if (state?.rowDeletedAt) {
    console.warn({
      message: "Ignored work checker result for a deleted work",
      workId: result.workId,
      outcome: result.outcome,
    });
    return { status: "applied", backups: [] };
  }

  const processResult = await toProcessResult(result, state?.currentChapters);
  if (processResult === "needs_chapter_index") return { status: "needs_chapter_index" };

  if (state === null) {
    await handleFetchResult(db, env, processResult);
    return { status: "applied", backups: [] };
  }

  await handleRefreshResult(db, env, state.refreshFailures, processResult);
  if (!processResult.success) return { status: "applied", backups: [] };

  try {
    return { status: "applied", backups: await pendingBackups(db, processResult) };
  } catch (error) {
    console.error({
      message: "Failed to list work checker backups",
      workId: result.workId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "applied", backups: [] };
  }
}

/**
 * Store a format the checker downloaded. Only the work's current download revision is accepted.
 */
export async function storeWorkCheckerBackup(
  db: TDatabase,
  env: CloudflareBindings,
  workId: number,
  format: WorkCheckerBackupFormat,
  downloadUpdatedAtUnix: number,
  fileContent: ArrayBuffer,
): Promise<WorkCheckerBackupOutcome> {
  const state = await getWorkCheckState(db, workId);
  const downloadUpdatedAt = state?.downloadUpdatedAt;
  if (
    !downloadUpdatedAt ||
    state.rowDeletedAt ||
    Math.floor(downloadUpdatedAt.getTime() / 1000) !== downloadUpdatedAtUnix
  ) {
    return "superseded";
  }
  if (await isBackupCurrent(db, workId, format, downloadUpdatedAt)) return "current";

  const r2Key = await storeWorkBackup(db, env, workId, format, downloadUpdatedAt, fileContent);
  console.log({
    message: "Work format backed up",
    workId,
    format,
    r2Key,
    fileSize: fileContent.byteLength,
    source: "work-checker",
  });
  return "stored";
}
