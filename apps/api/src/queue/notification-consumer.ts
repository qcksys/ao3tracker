import type { TDatabase } from "~/db/db.client";
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
        const { title, body, payload, userIds, workId, notificationType } =
            message.body;

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

        // Acknowledge message - it was processed successfully
        message.ack();
    } catch (error) {
        console.error({
            message: "Failed to process notification message",
            workId: message.body.workId,
            error: error instanceof Error ? error.message : String(error),
        });

        // Retry the message
        message.retry();
    }
}
