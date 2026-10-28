/**
 * Docker healthcheck: healthy while polls keep reaching the Worker. Run directly with
 * `node src/health.ts`; the poll loop writes the status file after each successful poll.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const STATUS_FILE = process.env.STATUS_FILE ?? "/tmp/work-checker-status.json";

/** Allowance on top of two poll intervals for a poll's own duration */
const GRACE_MS = 10 * 60_000;

export interface HealthStatus {
  polledAt: number;
  pollIntervalSeconds: number;
}

export function isHealthy(status: HealthStatus, now: number): boolean {
  return now - status.polledAt < status.pollIntervalSeconds * 2000 + GRACE_MS;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const status: HealthStatus = JSON.parse(readFileSync(STATUS_FILE, "utf8"));
    process.exitCode = isHealthy(status, Date.now()) ? 0 : 1;
  } catch {
    // No successful poll yet.
    process.exitCode = 1;
  }
}
