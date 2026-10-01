import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { datetime, index, int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

export const tWork = mysqlTable(
  `${DB_TABLE_PREFIX}work`,
  {
    id: int({ unsigned: true }).notNull().primaryKey(),
    title: varchar({ length: 255 }).notNull(),
    author: varchar({ length: 255 }).notNull(),
    authorUrl: varchar({ length: 255 }),
    summary: text(),
    language: varchar({ length: 50 }).notNull(),
    wordCount: int({ unsigned: true }).notNull(),
    currentChapters: int({ unsigned: true }).notNull(),
    totalChapters: int({ unsigned: true }),
    hits: int({ unsigned: true }).notNull().default(0),
    kudos: int({ unsigned: true }).notNull().default(0),
    bookmarks: int({ unsigned: true }).notNull().default(0),
    comments: int({ unsigned: true }).notNull().default(0),
    published: datetime().notNull(),
    lastUpdated: datetime().notNull(),
    lastRefreshed: datetime()
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    downloadPath: varchar({ length: 255 }),
    downloadUpdatedAt: datetime(),
    ...syncTimestampCols,
  },
  (table) => {
    return [
      index("idx_works_title").on(table.title),
      index("idx_works_author").on(table.author),
      index("idx_works_language").on(table.language),
      index("idx_works_wordCount").on(table.wordCount),
      index("idx_works_published").on(table.published),
      index("idx_works_lastUpdated").on(table.lastUpdated),
      index("idx_works_rowCreatedAt").on(table.rowCreatedAt),
      index("idx_works_rowUpdatedAt").on(table.rowUpdatedAt),
      index("idx_works_rowDeletedAt").on(table.rowDeletedAt),
    ];
  },
);

export type TWorkS = InferSelectModel<typeof tWork>;
export type TWorkI = OmitTimestampCols<InferInsertModel<typeof tWork>>;
/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tWorkTimestampExclude = [tWork.rowCreatedAt, tWork.rowUpdatedAt] as const;

export const sWorkS = createSelectSchema(tWork);
export const sWorkI = omitTimestampCols(createInsertSchema(tWork));
export const sWorkU = omitTimestampCols(createUpdateSchema(tWork));
