import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { asc, eq } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
  type TWorkCheckerStatusI,
  type TWorkCheckerStatusS,
  tWorkCheckerStatus,
  tWorkCheckerStatusUpsertExclude,
} from "~/db/schema/work.checker.status";

/**
 * Record a checker's latest status report, replacing its previous one
 */
export async function upsertWorkCheckerStatus(
  db: TDatabase,
  data: TWorkCheckerStatusI,
): Promise<void> {
  await db
    .insert(tWorkCheckerStatus)
    .values(data)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tWorkCheckerStatus, { exclude: tWorkCheckerStatusUpsertExclude }),
    );
}

/**
 * Every checker's latest status report
 */
export async function listWorkCheckerStatuses(
  db: TDatabase,
): Promise<Pick<TWorkCheckerStatusS, "checkerId" | "status" | "reportedAt" | "downAlertSentAt">[]> {
  return db
    .select({
      checkerId: tWorkCheckerStatus.checkerId,
      status: tWorkCheckerStatus.status,
      reportedAt: tWorkCheckerStatus.reportedAt,
      downAlertSentAt: tWorkCheckerStatus.downAlertSentAt,
    })
    .from(tWorkCheckerStatus)
    .orderBy(asc(tWorkCheckerStatus.checkerId));
}

/**
 * Record that a down alert was sent for a checker, or clear it with null once it recovers
 */
export async function setWorkCheckerDownAlertSentAt(
  db: TDatabase,
  checkerId: string,
  downAlertSentAt: Date | null,
): Promise<void> {
  await db
    .update(tWorkCheckerStatus)
    .set({ downAlertSentAt })
    .where(eq(tWorkCheckerStatus.checkerId, checkerId));
}
