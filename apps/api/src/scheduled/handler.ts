import { fetchMissingWorks } from "~/scheduled/fetch-missing-works";
import { refreshStaleWorks } from "~/scheduled/refresh-works";

export const scheduled = async (
  event: ScheduledEvent,
  env: CloudflareBindings,
  ctx: ExecutionContext,
): Promise<void> => {
  switch (event.cron) {
    case "*/5 * * * *": {
      ctx.waitUntil(refreshStaleWorks(env));
      ctx.waitUntil(fetchMissingWorks(env));
      return;
    }
  }
};
