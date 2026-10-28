import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createCheckerApi } from "./api.ts";
import { launchAo3Browser } from "./browser.ts";
import { runPoll } from "./checker.ts";
import { STATUS_FILE, type WorkCheckerStatus } from "./health.ts";
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
log.info({ message: "Work checker started", apiUrl });

while (!shutdown.signal.aborted) {
  let pollIntervalSeconds = FALLBACK_POLL_INTERVAL_SECONDS;
  try {
    ({ pollIntervalSeconds } = await runPoll({ api, browser, sleep }));
    const status: WorkCheckerStatus = { polledAt: Date.now(), pollIntervalSeconds };
    await writeFile(STATUS_FILE, JSON.stringify(status));
  } catch (error) {
    if (shutdown.signal.aborted) break;
    log.error({ message: "Poll failed", error: errorMessage(error) });
  }
  await sleep(pollIntervalSeconds * 1000).catch(() => undefined);
}

await browser.close();
log.info({ message: "Work checker stopped" });
