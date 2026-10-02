import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
  type NotificationStatus,
  type NotificationType,
  type TNotificationI,
  type TNotificationS,
  tNotification,
} from "~/db/schema/notification";
import { tTrackWork } from "~/db/schema/track.work";

/** Data for creating a notification */
export type NotificationCreate = Pick<
  TNotificationI,
  "userId" | "workId" | "type" | "title" | "body" | "payload" | "dispatchPending"
>;

/**
 * Insert a new notification
 */
export async function insertNotification(db: TDatabase, data: NotificationCreate): Promise<number> {
  const result = await db.insert(tNotification).values(data);
  return Number(result.insertId);
}

/**
 * Insert multiple notifications (batch)
 */
export async function insertNotifications(
  db: TDatabase,
  data: NotificationCreate[],
): Promise<void> {
  if (data.length === 0) return;
  await db.insert(tNotification).values(data);
}

export async function getPendingNotificationDispatches(
  db: TDatabase,
  workId?: number,
): Promise<TNotificationS[]> {
  return db
    .select()
    .from(tNotification)
    .where(
      and(
        eq(tNotification.dispatchPending, true),
        workId === undefined ? undefined : eq(tNotification.workId, workId),
      ),
    )
    .orderBy(asc(tNotification.rowUpdatedAt), asc(tNotification.id))
    .limit(500);
}

export async function recordNotificationDispatch(
  db: TDatabase,
  ids: number[],
  errorMessage?: string,
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(tNotification)
    .set({
      dispatchPending: errorMessage !== undefined,
      errorMessage: errorMessage ?? null,
      retryCount: errorMessage === undefined ? undefined : sql`${tNotification.retryCount} + 1`,
      rowUpdatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(inArray(tNotification.id, ids));
}

/**
 * Update notification status after send attempt
 */
export async function updateNotificationStatus(
  db: TDatabase,
  notificationId: number,
  status: NotificationStatus,
  options?: {
    fcmMessageId?: string;
    errorMessage?: string;
    incrementRetry?: boolean;
  },
): Promise<void> {
  await db
    .update(tNotification)
    .set({
      status,
      sentAt: status === "sent" ? new Date() : undefined,
      fcmMessageId: options?.fcmMessageId,
      errorMessage: options?.errorMessage,
      retryCount: options?.incrementRetry ? sql`${tNotification.retryCount} + 1` : undefined,
    })
    .where(eq(tNotification.id, notificationId));
}

/** Return type for notification history query */
export type NotificationHistoryItem = Pick<
  TNotificationS,
  "id" | "workId" | "type" | "title" | "body" | "sentAt" | "rowCreatedAt"
>;

/**
 * Get user notifications with cursor-based pagination (for notification history in app)
 */
export async function getUserNotifications(
  db: TDatabase,
  userId: string,
  options?: {
    cursor?: number;
    limit?: number;
  },
): Promise<{ notifications: NotificationHistoryItem[]; hasMore: boolean }> {
  const limit = options?.limit ?? 50;
  const cursor = options?.cursor;

  const conditions = [eq(tNotification.userId, userId)];
  if (cursor) {
    conditions.push(lt(tNotification.id, cursor));
  }

  const notifications = await db
    .select({
      id: tNotification.id,
      workId: tNotification.workId,
      type: tNotification.type,
      title: tNotification.title,
      body: tNotification.body,
      sentAt: tNotification.sentAt,
      rowCreatedAt: tNotification.rowCreatedAt,
    })
    .from(tNotification)
    .where(and(...conditions))
    .orderBy(desc(tNotification.id))
    .limit(limit + 1);

  const hasMore = notifications.length > limit;
  if (hasMore) {
    notifications.pop();
  }

  return { notifications, hasMore };
}

/**
 * Check if a notification of the given type already exists for a work within a time window.
 * Used to prevent duplicate notifications from concurrent cron runs and repeated error states.
 */
export async function hasRecentNotificationForWork(
  db: TDatabase,
  workId: number,
  type: NotificationType,
  sinceMinutesAgo: number,
): Promise<boolean> {
  const since = new Date(Date.now() - sinceMinutesAgo * 60 * 1000);
  const result = await db
    .select({ id: tNotification.id })
    .from(tNotification)
    .where(
      and(
        eq(tNotification.workId, workId),
        eq(tNotification.type, type),
        gt(tNotification.rowCreatedAt, since),
      ),
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get users who are tracking AND subscribed to a specific work
 */
export async function getSubscribedUsersForWork(db: TDatabase, workId: number): Promise<string[]> {
  const results = await db
    .selectDistinct({ userId: tTrackWork.userId })
    .from(tTrackWork)
    .where(
      and(
        eq(tTrackWork.workId, workId),
        eq(tTrackWork.subscribed, true),
        isNull(tTrackWork.rowDeletedAt),
      ),
    );

  console.log({
    message: "getSubscribedUsersForWork query result",
    workId,
    userCount: results.length,
    userIds: results.map((r) => r.userId),
  });

  return results.map((r) => r.userId);
}
