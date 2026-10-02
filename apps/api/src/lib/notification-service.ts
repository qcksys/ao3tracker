import type { TDatabase } from "~/db/db.client";
import {
  getPendingNotificationDispatches,
  getSubscribedUsersForWork,
  hasRecentNotificationForWork,
  insertNotifications,
  type NotificationCreate,
  recordNotificationDispatch,
} from "~/db/queries/notification";
import type { NotificationType } from "~/db/schema/notification";

export interface WorkUpdateEvent {
  workId: number;
  workTitle: string;
  type: NotificationType;
  oldChapters?: number;
  newChapters?: number;
  totalChapters?: number | null;
}

export interface NotificationQueueMessage {
  type: "work_notification";
  workId: number;
  notificationType: NotificationType;
  title: string;
  body: string;
  payload: string;
  userIds: string[];
  deviceId?: string;
}

/**
 * Generate notification title and body based on event type
 */
export function generateNotificationContent(event: WorkUpdateEvent): {
  title: string;
  body: string;
} {
  const { workTitle, type, oldChapters, newChapters, totalChapters } = event;

  switch (type) {
    case "new_chapters": {
      const chapterCount = (newChapters ?? 0) - (oldChapters ?? 0);
      const chapterText = chapterCount === 1 ? "chapter" : "chapters";
      const progressText = totalChapters
        ? ` (${newChapters}/${totalChapters})`
        : ` (${newChapters}/?)`;
      return {
        title: "New chapter available",
        body: `${workTitle} has ${chapterCount} new ${chapterText}${progressText}`,
      };
    }
    case "work_completed":
      return {
        title: "Work completed!",
        body: `${workTitle} has been marked as complete`,
      };
    case "work_restricted":
      return {
        title: "Work restricted",
        body: `${workTitle} is now restricted (requires AO3 login)`,
      };
    case "work_deleted":
      return {
        title: "Work deleted",
        body: `${workTitle} has been deleted from AO3`,
      };
    default:
      return {
        title: "Work updated",
        body: `${workTitle} has been updated`,
      };
  }
}

/**
 * Create notifications for all subscribed users tracking a work and queue for delivery
 */
export async function createWorkNotifications(
  db: TDatabase,
  queue: Queue<NotificationQueueMessage>,
  event: WorkUpdateEvent,
): Promise<number> {
  // Dedup: skip if a notification of the same type was already created for this work recently.
  // Prevents duplicates from concurrent cron invocations and repeated error states.
  const DEDUP_WINDOW_MINUTES = 60;
  const isDuplicate = await hasRecentNotificationForWork(
    db,
    event.workId,
    event.type,
    DEDUP_WINDOW_MINUTES,
  );
  if (isDuplicate) {
    await dispatchPendingNotifications(db, queue, event.workId);
    console.log({
      message: "Skipping duplicate notification",
      workId: event.workId,
      type: event.type,
    });
    return 0;
  }

  // Get all users tracking AND subscribed to this work
  const userIds = await getSubscribedUsersForWork(db, event.workId);

  if (userIds.length === 0) {
    console.log({
      message: "No subscribed users for work, skipping notification",
      workId: event.workId,
      type: event.type,
    });
    return 0;
  }

  const { title, body } = generateNotificationContent(event);
  const payload = JSON.stringify({
    workId: event.workId,
    type: event.type,
    oldChapters: event.oldChapters,
    newChapters: event.newChapters,
  });

  // Create notification records for each user
  const notifications: NotificationCreate[] = userIds.map((userId) => ({
    userId,
    workId: event.workId,
    type: event.type,
    title,
    body,
    payload,
    dispatchPending: true,
  }));

  // Insert all notifications
  await insertNotifications(db, notifications);

  await dispatchPendingNotifications(db, queue, event.workId);

  console.log({
    message: "Notifications persisted for delivery",
    workId: event.workId,
    type: event.type,
    userCount: userIds.length,
  });

  return userIds.length;
}

export async function dispatchPendingNotifications(
  db: TDatabase,
  queue: Queue<NotificationQueueMessage>,
  workId?: number,
): Promise<void> {
  const pending = await getPendingNotificationDispatches(db, workId);
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100);
    const ids = batch.map((notification) => notification.id);
    try {
      await queue.sendBatch(
        batch.map((notification) => ({
          body: {
            type: "work_notification" as const,
            workId: notification.workId,
            notificationType: notification.type,
            title: notification.title,
            body: notification.body,
            payload: notification.payload ?? "{}",
            userIds: [notification.userId],
          },
        })),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await recordNotificationDispatch(db, ids, errorMessage);
      console.error({
        message: "Notification dispatch deferred",
        count: ids.length,
        error: errorMessage,
      });
      continue;
    }
    // A crash before this update can replay a batch; queue delivery is at least once.
    await recordNotificationDispatch(db, ids);
  }
}
