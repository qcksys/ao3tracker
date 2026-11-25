import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

export const tWork = pgTable(
  `${DB_TABLE_PREFIX}work`,
  {
    id: bigint({ mode: "number" }).notNull().primaryKey(),
    title: varchar({ length: 255 }).notNull(),
    author: varchar({ length: 255 }).notNull(),
    authorUrl: varchar({ length: 255 }),
    summary: text(),
    language: varchar({ length: 50 }).notNull(),
    wordCount: bigint({ mode: "number" }).notNull(),
    currentChapters: bigint({ mode: "number" }).notNull(),
    totalChapters: bigint({ mode: "number" }),
    hits: bigint({ mode: "number" }).notNull().default(0),
    kudos: bigint({ mode: "number" }).notNull().default(0),
    bookmarks: bigint({ mode: "number" }).notNull().default(0),
    comments: bigint({ mode: "number" }).notNull().default(0),
    published: timestamp({ withTimezone: true, precision: 0 }).notNull(),
    lastUpdated: timestamp({ withTimezone: true, precision: 0 }).notNull(),
    lastRefreshed: timestamp({ withTimezone: true, precision: 0 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    /** Consecutive failed scheduled refreshes; sets the retry backoff */
    refreshFailures: bigint({ mode: "number" }).notNull().default(0),
    downloadPath: varchar({ length: 255 }),
    downloadUpdatedAt: timestamp({ withTimezone: true, precision: 0 }),
    ...syncTimestampCols,
  },
  (table) => {
    return [
      index(`${DB_TABLE_PREFIX}idx_works_title`).on(table.title),
      index(`${DB_TABLE_PREFIX}idx_works_author`).on(table.author),
      index(`${DB_TABLE_PREFIX}idx_works_language`).on(table.language),
      index(`${DB_TABLE_PREFIX}idx_works_wordCount`).on(table.wordCount),
      index(`${DB_TABLE_PREFIX}idx_works_published`).on(table.published),
      index(`${DB_TABLE_PREFIX}idx_works_lastUpdated`).on(table.lastUpdated),
      index(`${DB_TABLE_PREFIX}idx_works_lastRefreshed`).on(table.lastRefreshed),
      index(`${DB_TABLE_PREFIX}idx_works_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_works_rowUpdatedAt`).on(table.rowUpdatedAt),
      index(`${DB_TABLE_PREFIX}idx_works_rowDeletedAt`).on(table.rowDeletedAt),
    ];
  },
);

export type TWorkS = InferSelectModel<typeof tWork>;
export type TWorkI = OmitTimestampCols<InferInsertModel<typeof tWork>>;
/** Columns to exclude from upserts (preserve creation time and let the trigger record changes) */
export const tWorkTimestampExclude = [tWork.rowCreatedAt, tWork.rowUpdatedAt] as const;

export const sWorkS = createSelectSchema(tWork);
export const sWorkI = omitTimestampCols(createInsertSchema(tWork));
export const sWorkU = omitTimestampCols(createUpdateSchema(tWork));
