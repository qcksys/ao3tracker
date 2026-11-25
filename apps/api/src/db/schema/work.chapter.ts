import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

export const tWorkChapter = pgTable(
  `${DB_TABLE_PREFIX}work_chapter`,
  {
    id: bigint({ mode: "number" }).notNull(),
    workId: bigint({ mode: "number" }).notNull(),
    number: bigint({ mode: "number" }),
    title: varchar({ length: 255 }),
    dateUpdated: timestamp({ withTimezone: true, precision: 0 }),
    ...syncTimestampCols,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.id, table.workId] }),
      index(`${DB_TABLE_PREFIX}idx_chapters_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_chapters_rowUpdatedAt`).on(table.rowUpdatedAt),
      index(`${DB_TABLE_PREFIX}idx_chapters_rowDeletedAt`).on(table.rowDeletedAt),
      index(`${DB_TABLE_PREFIX}idx_chapters_workId_number`).on(table.workId, table.number),
    ];
  },
);

export type TWorkChapterS = InferSelectModel<typeof tWorkChapter>;
export type TWorkChapterI = OmitTimestampCols<InferInsertModel<typeof tWorkChapter>>;
/** Primary key columns for composite key upsert exclusion */
export const tWorkChapterPK = [tWorkChapter.id, tWorkChapter.workId] as const;
/** Columns to exclude from upserts (preserve creation time and let the trigger record changes) */
export const tWorkChapterTimestampExclude = [
  tWorkChapter.rowCreatedAt,
  tWorkChapter.rowUpdatedAt,
] as const;

export const sWorkChapterS = createSelectSchema(tWorkChapter);
export const sWorkChapterI = omitTimestampCols(createInsertSchema(tWorkChapter));
export const sWorkChapterU = omitTimestampCols(createUpdateSchema(tWorkChapter));
