import type {
  WorkCheckerJob,
  WorkCheckerResult,
  WorkCheckerSettings,
} from "@qcksys/ao3tracker-core/work-checker";
import type { CheckerApi } from "./api.ts";
import type { Ao3Browser, PageLoad } from "./browser.ts";
import { errorMessage, log } from "./log.ts";

const AO3_BASE_URL = "https://archiveofourown.org";

const backupContentTypes = { epub: "application/epub+zip", html: "text/html" } as const;

export interface CheckerDeps {
  api: CheckerApi;
  browser: Ao3Browser;
  sleep: (ms: number) => Promise<void>;
}

/** The first-chapter view: it has the chapter dropdown the Worker parses, unlike the full view */
export function workUrl(workId: number): string {
  return `${AO3_BASE_URL}/works/${workId}?view_adult=true`;
}

export function chapterIndexUrl(workId: number): string {
  return `${AO3_BASE_URL}/works/${workId}/navigate?view_adult=true`;
}

/**
 * Turn a page load that is not a readable page into the result to report. Returns null for a
 * page whose HTML the Worker should parse.
 */
export function classifyLoad(workId: number, load: PageLoad): WorkCheckerResult | null {
  if (load.challenged) {
    return { outcome: "unavailable", workId, error: "Cloudflare challenge did not clear" };
  }
  if (new URL(load.finalUrl).pathname.startsWith("/users/login")) {
    return { outcome: "restricted", workId };
  }
  if (load.status === 404) return { outcome: "not_found", workId };
  if (load.status === 429 || load.status >= 500) {
    return { outcome: "unavailable", workId, error: `AO3 responded with status ${load.status}` };
  }
  if (load.status < 200 || load.status >= 300) {
    return { outcome: "failed", workId, error: `AO3 responded with status ${load.status}` };
  }
  return null;
}

async function loadPage(
  browser: Ao3Browser,
  workId: number,
  url: string,
): Promise<{ html: string } | { result: WorkCheckerResult }> {
  try {
    const load = await browser.load(url);
    const result = classifyLoad(workId, load);
    return result ? { result } : { html: load.html };
  } catch (error) {
    // Navigation timeouts and network errors mean AO3 is not answering.
    return { result: { outcome: "unavailable", workId, error: errorMessage(error) } };
  }
}

/**
 * Check one work and report it to the Worker. Returns false when AO3 is unavailable, so the
 * caller stops sending it requests until the next poll.
 */
export async function checkWork(
  job: WorkCheckerJob,
  settings: WorkCheckerSettings,
  { api, browser, sleep }: CheckerDeps,
): Promise<boolean> {
  const { workId } = job;
  const report = async (result: WorkCheckerResult) => {
    await api.postResult(result);
    log.info({ message: "Reported work", workId, kind: job.kind, outcome: result.outcome });
    return result.outcome !== "unavailable";
  };

  const work = await loadPage(browser, workId, workUrl(workId));
  if ("result" in work) return report(work.result);

  let response = await api.postResult({ outcome: "page", workId, workHtml: work.html });
  if (response.status === "needs_chapter_index") {
    await sleep(settings.delayBetweenRequestsMs);
    const index = await loadPage(browser, workId, chapterIndexUrl(workId));
    if ("result" in index) return report(index.result);
    response = await api.postResult({
      outcome: "page",
      workId,
      workHtml: work.html,
      chapterIndexHtml: index.html,
    });
    if (response.status === "needs_chapter_index") {
      throw new Error(`Worker asked again for the chapter index of work ${workId}`);
    }
  }
  log.info({ message: "Reported work", workId, kind: job.kind, outcome: "page" });

  for (const backup of response.backups) {
    await sleep(settings.delayBetweenRequestsMs);
    try {
      const download = await browser.download(backup.url);
      // AO3 serves downloads as attachments; an inline response must be the format itself.
      const isFile =
        download.attachment || download.contentType.startsWith(backupContentTypes[backup.format]);
      if (download.status !== 200 || !isFile) {
        // The Worker lists the format again on the next refresh.
        log.warn({
          message: "Skipped backup download",
          workId,
          format: backup.format,
          status: download.status,
          contentType: download.contentType,
        });
        continue;
      }
      const outcome = await api.uploadBackup(workId, backup, download.body);
      log.info({ message: "Uploaded backup", workId, format: backup.format, outcome });
    } catch (error) {
      log.error({
        message: "Failed to back up work format",
        workId,
        format: backup.format,
        error: errorMessage(error),
      });
    }
  }
  return true;
}

/**
 * One poll: read the settings, claim works and check them one at a time. Returns the settings so
 * the caller can wait the configured interval.
 */
export async function runPoll(deps: CheckerDeps): Promise<WorkCheckerSettings> {
  const settings = await deps.api.settings();
  if (!settings.enabled) return settings;

  const jobs = await deps.api.claim();
  for (const [index, job] of jobs.entries()) {
    if (index > 0) await deps.sleep(settings.delayBetweenRequestsMs);
    if (!(await checkWork(job, settings, deps))) {
      // Unprocessed refresh claims expire and are handed out again later.
      log.warn({
        message: "AO3 unavailable, ending poll",
        workId: job.workId,
        skipped: jobs.length - index - 1,
      });
      break;
    }
  }
  log.info({ message: "Poll completed", claimed: jobs.length });
  return settings;
}
