import type { WorkCheckerStatus } from "@qcksys/ao3tracker-core/work-checker";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

/**
 * The latest status report from each browser work checker, keyed by its `checkerId`. Each
 * report replaces the previous one; `reportedAt` is when the Worker received it.
 */
export const tWorkCheckerStatus = pgTable(`${DB_TABLE_PREFIX}work_checker_status`, {
  checkerId: varchar({ length: 64 }).notNull().primaryKey(),
  status: jsonb().$type<WorkCheckerStatus>().notNull(),
  reportedAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
  /** When the cron emailed the admins that this checker is down; null once it has recovered */
  downAlertSentAt: timestamp({ withTimezone: true, precision: 3 }),
  ...timestampCols,
});

/**
 * Columns to exclude from upserts: preserve creation time and let the trigger record changes, and
 * leave the alert state to the cron, so a new report does not clear it
 */
export const tWorkCheckerStatusUpsertExclude = [
  tWorkCheckerStatus.checkerId,
  tWorkCheckerStatus.downAlertSentAt,
  tWorkCheckerStatus.rowCreatedAt,
  tWorkCheckerStatus.rowUpdatedAt,
] as const;

export type TWorkCheckerStatusS = InferSelectModel<typeof tWorkCheckerStatus>;
export type TWorkCheckerStatusI = OmitTimestampCols<InferInsertModel<typeof tWorkCheckerStatus>>;

export const sWorkCheckerStatusS = createSelectSchema(tWorkCheckerStatus);
export const sWorkCheckerStatusI = omitTimestampCols(createInsertSchema(tWorkCheckerStatus));
export const sWorkCheckerStatusU = omitTimestampCols(createUpdateSchema(tWorkCheckerStatus));
