import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { asc } from "drizzle-orm";
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
): Promise<Pick<TWorkCheckerStatusS, "checkerId" | "status" | "reportedAt">[]> {
  return db
    .select({
      checkerId: tWorkCheckerStatus.checkerId,
      status: tWorkCheckerStatus.status,
      reportedAt: tWorkCheckerStatus.reportedAt,
    })
    .from(tWorkCheckerStatus)
    .orderBy(asc(tWorkCheckerStatus.checkerId));
}
