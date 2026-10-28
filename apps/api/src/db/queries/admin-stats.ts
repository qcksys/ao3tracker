import {
  and,
  count,
  countDistinct,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  max,
  type SQL,
  sum,
} from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { TDatabase } from "~/db/db.client";
import { tAuthUser } from "~/db/schema/auth.user";
import { tNotification } from "~/db/schema/notification";
import { tPushToken } from "~/db/schema/push.token";
import { tTrackWork } from "~/db/schema/track.work";
import { tWork } from "~/db/schema/work";
import { tWorkBackup } from "~/db/schema/work.backup";

export interface AdminStatsWindow {
  /** Works last refreshed before this are due for a refresh */
  staleBefore: Date;
  usersSince: Date;
  /**
   * Successful refreshes since this. Leases and failures also move lastRefreshed, but a success
   * is the only write that sets it to now with refreshFailures 0; keep this under the lease's
   * 5.5-hour offset.
   */
  refreshedSince: Date;
  notificationsSince: Date;
}

export interface AdminStats {
  users: { total: number; recent: number; admins: number };
  tracking: { trackedWorks: number; trackingRows: number };
  works: {
    stored: number;
    deleted: number;
    stale: number;
    failing: number;
    refreshedRecently: number;
    lastRefreshedAt: Date | null;
  };
  notifications: { pendingDispatch: number; createdRecently: number; failed: number };
  devices: { pushTokens: number };
  backups: { count: number; totalBytes: number; lastBackupAt: Date | null };
}

async function countRows(db: TDatabase, table: MySqlTable, where?: SQL): Promise<number> {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return row.value;
}

/**
 * Whole-app counts for the admin dashboard, one aggregate query each
 */
export async function getAdminStats(db: TDatabase, window: AdminStatsWindow): Promise<AdminStats> {
  const { staleBefore, usersSince, refreshedSince, notificationsSince } = window;
  const liveWork = isNull(tWork.rowDeletedAt);

  const [
    usersTotal,
    usersRecent,
    admins,
    [tracking],
    [works],
    deletedWorks,
    staleWorks,
    failingWorks,
    refreshedWorks,
    pendingDispatch,
    createdRecently,
    failedNotifications,
    pushTokens,
    [backups],
  ] = await Promise.all([
    countRows(db, tAuthUser),
    countRows(db, tAuthUser, gte(tAuthUser.createdAt, usersSince)),
    countRows(db, tAuthUser, eq(tAuthUser.role, "admin")),
    db
      .select({ trackedWorks: countDistinct(tTrackWork.workId), trackingRows: count() })
      .from(tTrackWork)
      .where(isNull(tTrackWork.rowDeletedAt)),
    db
      .select({ stored: count(), lastRefreshedAt: max(tWork.lastRefreshed) })
      .from(tWork)
      .where(liveWork),
    countRows(db, tWork, isNotNull(tWork.rowDeletedAt)),
    countRows(db, tWork, and(liveWork, lt(tWork.lastRefreshed, staleBefore))),
    countRows(db, tWork, and(liveWork, gt(tWork.refreshFailures, 0))),
    countRows(
      db,
      tWork,
      and(liveWork, eq(tWork.refreshFailures, 0), gte(tWork.lastRefreshed, refreshedSince)),
    ),
    countRows(db, tNotification, eq(tNotification.dispatchPending, true)),
    countRows(db, tNotification, gte(tNotification.rowCreatedAt, notificationsSince)),
    countRows(db, tNotification, eq(tNotification.status, "failed")),
    countRows(db, tPushToken, isNull(tPushToken.rowDeletedAt)),
    db
      .select({
        count: count(),
        totalBytes: sum(tWorkBackup.fileSize),
        lastBackupAt: max(tWorkBackup.rowCreatedAt),
      })
      .from(tWorkBackup)
      .where(isNull(tWorkBackup.rowDeletedAt)),
  ]);

  return {
    users: { total: usersTotal, recent: usersRecent, admins },
    tracking,
    works: {
      stored: works.stored,
      deleted: deletedWorks,
      stale: staleWorks,
      failing: failingWorks,
      refreshedRecently: refreshedWorks,
      lastRefreshedAt: works.lastRefreshedAt,
    },
    notifications: { pendingDispatch, createdRecently, failed: failedNotifications },
    devices: { pushTokens },
    backups: {
      count: backups.count,
      totalBytes: Number(backups.totalBytes ?? 0),
      lastBackupAt: backups.lastBackupAt,
    },
  };
}
