import { createDbConnection } from "~/db/db.client";
import { dispatchPendingNotifications } from "~/lib/notification-service";
import { workCheckerSettings } from "~/lib/work-checker";
import { fetchMissingWorks } from "~/scheduled/fetch-missing-works";
import { refreshStaleWorks } from "~/scheduled/refresh-works";

export const scheduled = async (
  event: ScheduledEvent,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> => {
  switch (event.cron) {
    case "*/5 * * * *": {
      const db = createDbConnection(env.DATABASE_URL);
      ctx.waitUntil(dispatchPendingNotifications(db, env.NOTIFICATION_QUEUE));
      // While the browser work checker is enabled it loads AO3 pages instead of the Worker.
      if (!(await workCheckerSettings(db)).enabled) {
        ctx.waitUntil(refreshStaleWorks(env));
        ctx.waitUntil(fetchMissingWorks(env));
      }
      return;
    }
  }
};
