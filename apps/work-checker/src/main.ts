import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { WorkCheckerStatus } from "@qcksys/ao3tracker-core/work-checker";
import { createCheckerApi } from "./api.ts";
import { launchAo3Browser } from "./browser.ts";
import { runPoll } from "./checker.ts";
import { type HealthStatus, STATUS_FILE } from "./health.ts";
import { errorMessage, log } from "./log.ts";

/** Used when the settings could not be read */
const FALLBACK_POLL_INTERVAL_SECONDS = 300;

const apiUrl = process.env.API_URL?.replace(/\/+$/, "");
// A token file keeps the secret out of the container's environment and `docker inspect`.
const tokenFile = process.env.WORK_CHECKER_TOKEN_FILE;
const token = tokenFile ? readFileSync(tokenFile, "utf8").trim() : process.env.WORK_CHECKER_TOKEN;
if (!apiUrl || !token) {
  throw new Error("API_URL and WORK_CHECKER_TOKEN (or WORK_CHECKER_TOKEN_FILE) must be set");
}

const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown.abort());
}
/** Rejects on shutdown, which ends a poll between requests rather than hurrying through it */
const sleep = (ms: number) => delay(ms, undefined, { signal: shutdown.signal });

const api = createCheckerApi(apiUrl, token);
const browser = await launchAo3Browser(process.env.PROFILE_DIR ?? "/data/profile");

/** Reported to the Worker for its admin dashboard after startup and every poll */
const status: WorkCheckerStatus = {
  checkerId: process.env.CHECKER_ID ?? "work-checker",
  version: process.env.CHECKER_VERSION ?? "unknown",
  startedAt: new Date().toISOString(),
  lastPoll: null,
  lastError: null,
};
async function reportStatus() {
  await api.postStatus(status).catch((error) => {
    // The dashboard shows the checker as silent; the next poll reports again.
    log.warn({ message: "Could not report status", error: errorMessage(error) });
  });
}

log.info({
  message: "Work checker started",
  apiUrl,
  checkerId: status.checkerId,
  version: status.version,
});
await reportStatus();

while (!shutdown.signal.aborted) {
  let pollIntervalSeconds = FALLBACK_POLL_INTERVAL_SECONDS;
  try {
    const poll = await runPoll({ api, browser, sleep });
    pollIntervalSeconds = poll.settings.pollIntervalSeconds;
    status.lastPoll = poll.summary;
    const health: HealthStatus = { polledAt: Date.now(), pollIntervalSeconds };
    await writeFile(STATUS_FILE, JSON.stringify(health));
  } catch (error) {
    if (shutdown.signal.aborted) break;
    log.error({ message: "Poll failed", error: errorMessage(error) });
    status.lastError = {
      at: new Date().toISOString(),
      message: errorMessage(error).slice(0, 1000),
    };
  }
  await reportStatus();
  await sleep(pollIntervalSeconds * 1000).catch(() => undefined);
}

await browser.close();
log.info({ message: "Work checker stopped" });
