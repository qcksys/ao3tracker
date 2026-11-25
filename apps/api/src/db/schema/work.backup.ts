import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, pgEnum, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

export const backupFormats = ["html", "pdf", "mobi", "epub", "azw3"] as const;
export const backupFormat = pgEnum(`${DB_TABLE_PREFIX}backup_format`, backupFormats);
export type BackupFormat = (typeof backupFormats)[number];

export const tWorkBackup = pgTable(
  `${DB_TABLE_PREFIX}work_backup`,
  {
    r2Key: varchar({ length: 512 }).notNull().primaryKey(),
    workId: bigint({ mode: "number" }).notNull(),
    format: backupFormat().notNull(),
    fileSize: bigint({ mode: "number" }).notNull(),
    ao3UpdatedAt: timestamp({ withTimezone: true, precision: 0 }),
    ...timestampCols,
  },
  (table) => {
    return [
      index(`${DB_TABLE_PREFIX}idx_work_backup_workId`).on(table.workId),
      index(`${DB_TABLE_PREFIX}idx_work_backup_format`).on(table.workId, table.format),
      index(`${DB_TABLE_PREFIX}idx_work_backup_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_work_backup_rowDeletedAt`).on(table.rowDeletedAt),
    ];
  },
);

export type TWorkBackupS = InferSelectModel<typeof tWorkBackup>;
export type TWorkBackupI = OmitTimestampCols<InferInsertModel<typeof tWorkBackup>>;
/** Columns to exclude from upserts (preserve creation time and let the trigger record changes) */
export const tWorkBackupTimestampExclude = [
  tWorkBackup.rowCreatedAt,
  tWorkBackup.rowUpdatedAt,
] as const;

export const sWorkBackupS = createSelectSchema(tWorkBackup);
export const sWorkBackupI = omitTimestampCols(createInsertSchema(tWorkBackup));
export const sWorkBackupU = omitTimestampCols(createUpdateSchema(tWorkBackup));
