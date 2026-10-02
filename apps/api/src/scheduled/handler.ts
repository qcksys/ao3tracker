import { createDbConnection } from "~/db/db.client";
import { dispatchPendingNotifications } from "~/lib/notification-service";
import { fetchMissingWorks } from "~/scheduled/fetch-missing-works";
import { refreshStaleWorks } from "~/scheduled/refresh-works";

export const scheduled = async (
  event: ScheduledEvent,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> => {
  switch (event.cron) {
    case "*/5 * * * *": {
      ctx.waitUntil(
        dispatchPendingNotifications(createDbConnection(env.DATABASE_URL), env.NOTIFICATION_QUEUE),
      );
      ctx.waitUntil(refreshStaleWorks(env));
      ctx.waitUntil(fetchMissingWorks(env));
      return;
    }
  }
};
