import type { TDatabase } from "~/db/db.client";
import { getTokensByUserIds } from "~/db/queries/push-token";
import { sendNotificationsToUsers } from "~/lib/fcm-client";
import type { NotificationQueueMessage } from "~/lib/notification-service";

/**
 * Process notification queue messages
 * This is called by Cloudflare Workers when messages are available in the queue
 */
export async function processNotificationQueue(
  message: Message<NotificationQueueMessage>,
  env: CloudflareBindings,
  db: TDatabase,
): Promise<void> {
  try {
    const { title, body, payload, userIds, workId, notificationType, deviceId } = message.body;

    if (deviceId === undefined) {
      const tokens = await getTokensByUserIds(db, userIds);
      // Each device gets its own retry budget and dead-letter handling.
      for (let i = 0; i < tokens.length; i += 100) {
        await env.NOTIFICATION_QUEUE.sendBatch(
          tokens.slice(i, i + 100).map((token) => ({
            body: {
              ...message.body,
              userIds: [token.userId],
              deviceId: token.deviceId,
            },
          })),
        );
      }
      message.ack();
      return;
    }

    if (userIds.length !== 1) {
      throw new Error("A device delivery must target exactly one user");
    }

    const result = await sendNotificationsToUsers(
      db,
      env.FCM_SERVICE_ACCOUNT,
      userIds,
      {
        title,
        body,
        data: {
          workId: String(workId),
          type: notificationType,
          payload,
        },
      },
      deviceId,
    );

    console.log({
      message: "Notification batch processed",
      workId,
      notificationType,
      userCount: userIds.length,
      sent: result.sent,
      failed: result.failed,
      invalidTokensRemoved: result.invalidTokensRemoved,
    });

    if (result.failed > result.invalidTokensRemoved) {
      message.retry({ delaySeconds: 60 });
    } else {
      message.ack();
    }
  } catch (error) {
    console.error({
      message: "Failed to process notification message",
      workId: message.body.workId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Retry the message
    message.retry({ delaySeconds: 60 });
  }
}
