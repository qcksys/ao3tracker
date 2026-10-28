import type { WorkCheckerStatus } from "@qcksys/ao3tracker-core/work-checker";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { datetime, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

/**
 * The latest status report from each browser work checker, keyed by its `checkerId`. Each
 * report replaces the previous one; `reportedAt` is when the Worker received it.
 */
export const tWorkCheckerStatus = mysqlTable(`${DB_TABLE_PREFIX}work_checker_status`, {
  checkerId: varchar({ length: 64 }).notNull().primaryKey(),
  status: json().$type<WorkCheckerStatus>().notNull(),
  reportedAt: datetime({ fsp: 3 }).notNull(),
  ...timestampCols,
});

/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tWorkCheckerStatusUpsertExclude = [
  tWorkCheckerStatus.checkerId,
  tWorkCheckerStatus.rowCreatedAt,
  tWorkCheckerStatus.rowUpdatedAt,
] as const;

export type TWorkCheckerStatusS = InferSelectModel<typeof tWorkCheckerStatus>;
export type TWorkCheckerStatusI = OmitTimestampCols<InferInsertModel<typeof tWorkCheckerStatus>>;

export const sWorkCheckerStatusS = createSelectSchema(tWorkCheckerStatus);
export const sWorkCheckerStatusI = omitTimestampCols(createInsertSchema(tWorkCheckerStatus));
export const sWorkCheckerStatusU = omitTimestampCols(createUpdateSchema(tWorkCheckerStatus));
