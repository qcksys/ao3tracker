import { createDbConnection } from "~/db/db.client";
import type { NotificationQueueMessage } from "~/lib/notification-service";
import { processNotificationQueue } from "~/queue/notification-consumer";

export type MessageTypes = NotificationQueueMessage;

export const queue = async (
    batch: MessageBatch<MessageTypes>,
    env: CloudflareBindings,
    ctx: ExecutionContext,
): Promise<void> => {
    const db = createDbConnection(env.DATABASE_URL);

    console.log({
        message: "Processing queue batch",
        messageCount: batch.messages.length,
    });

    for (const message of batch.messages) {
        switch (message.body.type) {
            case "work_notification": {
                ctx.waitUntil(processNotificationQueue(message, env, db));
                return;
            }
        }
    }
};
