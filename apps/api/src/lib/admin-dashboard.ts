import type { WorkCheckerSettings } from "@qcksys/ao3tracker-core/work-checker";
import { subDays, subHours } from "date-fns";
import type { TDatabase } from "~/db/db.client";
import { type AdminStats, getAdminStats } from "~/db/queries/admin-stats";
import { listWorkCheckerStatuses } from "~/db/queries/work-checker-status";
import type { TWorkCheckerStatusS } from "~/db/schema/work.checker.status";
import { workCheckerSettings, workCheckerSilenceLimitMs } from "~/lib/work-checker";
import { STALE_THRESHOLD_HOURS } from "~/scheduled/refresh-works";

export interface CheckerOverview extends Pick<
  TWorkCheckerStatusS,
  "checkerId" | "status" | "reportedAt"
> {
  /** Silent for longer than two poll intervals plus five minutes */
  silent: boolean;
}

export interface AdminDashboard {
  generatedAt: Date;
  stats: AdminStats;
  settings: WorkCheckerSettings;
  checkers: CheckerOverview[];
}

export async function loadAdminDashboard(db: TDatabase, now: Date): Promise<AdminDashboard> {
  const [stats, settings, checkers] = await Promise.all([
    getAdminStats(db, {
      staleBefore: subHours(now, STALE_THRESHOLD_HOURS),
      usersSince: subDays(now, 7),
      refreshedSince: subHours(now, 1),
      notificationsSince: subHours(now, 24),
    }),
    workCheckerSettings(db),
    listWorkCheckerStatuses(db),
  ]);
  const silenceLimitMs = workCheckerSilenceLimitMs(settings);
  return {
    generatedAt: now,
    stats,
    settings,
    checkers: checkers.map((checker) => ({
      ...checker,
      silent: now.getTime() - checker.reportedAt.getTime() > silenceLimitMs,
    })),
  };
}
