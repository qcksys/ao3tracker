/**
 * Emails the admins when a browser work checker stops working, and again when it recovers. The
 * checker only ever calls the Worker, so its status reports are the only sign of its health.
 */

import type { WorkCheckerSettings, WorkCheckerStatus } from "@qcksys/ao3tracker-core/work-checker";
import type { TDatabase } from "~/db/db.client";
import { listAdminEmails } from "~/db/queries/auth-user";
import {
  listWorkCheckerStatuses,
  setWorkCheckerDownAlertSentAt,
} from "~/db/queries/work-checker-status";
import type { TWorkCheckerStatusS } from "~/db/schema/work.checker.status";
import { sendEmail } from "~/lib/email";
import { workCheckerSilenceLimitMs } from "~/lib/work-checker";

type CheckerHealth = Pick<TWorkCheckerStatusS, "checkerId" | "status" | "reportedAt">;
type AlertEnv = Pick<
  CloudflareBindings,
  "EMAIL" | "SYSTEM_EMAIL_ADDRESS" | "BETTER_AUTH_URL" | "ENVIRONMENT"
>;

/** The checker's last successful poll, or its start while it has not completed one */
function lastSuccessAt(status: WorkCheckerStatus): Date {
  return new Date(status.lastPoll?.at ?? status.startedAt);
}

/**
 * Down when the Worker has had no report within the limit, or reports still arrive but no poll
 * has succeeded within it
 */
export function isWorkCheckerDown(checker: CheckerHealth, limitMs: number, now: Date): boolean {
  const cutoff = now.getTime() - limitMs;
  return checker.reportedAt.getTime() < cutoff || lastSuccessAt(checker.status).getTime() < cutoff;
}

function downEmail(checker: CheckerHealth, env: AlertEnv) {
  const { checkerId, status, reportedAt } = checker;
  const lastError = status.lastError
    ? `${status.lastError.message} (${status.lastError.at})`
    : "none reported";
  return {
    subject: `Work checker ${checkerId} is down`,
    text:
      `The ${env.ENVIRONMENT} work checker ${checkerId} has not completed a poll since ` +
      `${lastSuccessAt(status).toISOString()}.\n\n` +
      `Last report received: ${reportedAt.toISOString()}\n` +
      `Last error: ${lastError}\n\n` +
      "While the checker is enabled the Worker leaves AO3 fetching to it, so works are not " +
      "being refreshed. To let the Worker fetch again, disable the checker in the admin " +
      `settings: ${env.BETTER_AUTH_URL}/admin/settings\n\n` +
      "You will get one more email when it recovers.",
  };
}

function recoveredEmail(checker: CheckerHealth, downAlertSentAt: Date, env: AlertEnv) {
  const { checkerId, status } = checker;
  return {
    subject: `Work checker ${checkerId} is working again`,
    text:
      `The ${env.ENVIRONMENT} work checker ${checkerId} completed a poll at ` +
      `${lastSuccessAt(status).toISOString()}. It was reported down at ` +
      `${downAlertSentAt.toISOString()}.\n\nDashboard: ${env.BETTER_AUTH_URL}/admin`,
  };
}

/**
 * Run from the cron: email the admins once when a checker goes down while the checker is
 * enabled, and once when it recovers. A failed send is logged and retried on the next run.
 */
export async function alertDownWorkCheckers(
  db: TDatabase,
  env: AlertEnv,
  settings: WorkCheckerSettings,
  now: Date,
): Promise<void> {
  try {
    const limitMs = workCheckerSilenceLimitMs(settings);
    let admins: string[] | undefined;
    for (const checker of await listWorkCheckerStatuses(db)) {
      const down = isWorkCheckerDown(checker, limitMs, now);
      let email: { subject: string; text: string };
      if (down && settings.enabled && checker.downAlertSentAt === null) {
        email = downEmail(checker, env);
      } else if (!down && checker.downAlertSentAt !== null) {
        email = recoveredEmail(checker, checker.downAlertSentAt, env);
      } else {
        continue;
      }

      try {
        admins ??= await listAdminEmails(db);
        if (admins.length === 0) {
          console.warn({
            message: "No admin account to email about a work checker",
            checkerId: checker.checkerId,
          });
          continue;
        }
        await sendEmail({
          binding: env.EMAIL,
          to: admins,
          fromAddress: env.SYSTEM_EMAIL_ADDRESS,
          fromName: "QckSys AO3 Tracker",
          ...email,
        });
        await setWorkCheckerDownAlertSentAt(db, checker.checkerId, down ? now : null);
        console.log({ message: "Sent work checker alert", checkerId: checker.checkerId, down });
      } catch (error) {
        console.error({
          message: "Failed to send or record work checker alert",
          checkerId: checker.checkerId,
          down,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    console.error({
      message: "Failed to check work checker health",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
