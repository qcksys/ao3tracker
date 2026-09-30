import { createDbConnection } from "~/db/db.client";
import type { NotificationQueueMessage } from "~/lib/notification-service";
import { processNotificationQueue } from "~/queue/notification-consumer";

export type MessageTypes = NotificationQueueMessage;

export const queue = async (
  batch: MessageBatch<MessageTypes>,
  env: CloudflareBindings,
  _ctx: ExecutionContext,
): Promise<void> => {
  const db = createDbConnection(env.DATABASE_URL);

  console.log({
    message: "Processing queue batch",
    messageCount: batch.messages.length,
  });

  // Process every message in the batch (each acks/retries itself) and await
  // them all before returning — a `return` inside the loop previously dropped
  // every message after the first.
  await Promise.all(
    batch.messages.map(async (message) => {
      switch (message.body.type) {
        case "work_notification": {
          await processNotificationQueue(message, env, db);
          break;
        }
      }
    }),
  );
};
