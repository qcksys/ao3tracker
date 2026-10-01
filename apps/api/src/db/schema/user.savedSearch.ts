import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, datetime, index, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

/**
 * Per-user saved AO3 searches: a named filter/search URL the user pinned from
 * an AO3 list page. Synced cross-device per-row via LWW on `updatedAt`.
 *
 * Tombstones-in-place: deleting sets `deleted = true` rather than removing the
 * row. The live set is `WHERE deleted = false`. The sync delta is
 * `WHERE rowUpdatedAt >= lastSyncedAt`, which carries late offline saves and
 * deletes.
 *
 * `id` is a client-generated uuid (the stable row identity), so `name` and
 * `url` can be edited without changing the key.
 */
export const tUserSavedSearch = mysqlTable(
  `${DB_TABLE_PREFIX}user_saved_search`,
  {
    userId: varchar({ length: 36 }).notNull(),
    id: varchar({ length: 36 }).notNull(),
    name: varchar({ length: 191 }).notNull(),
    url: varchar({ length: 8192 }).notNull(),
    deleted: boolean().notNull().default(false),
    updatedAt: datetime({ fsp: 3 }).notNull(),
    ...syncTimestampCols,
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.userId, table.id],
      }),
      // Composite index supporting incremental delta queries
      index("idx_user_saved_search_user_updatedAt").on(table.userId, table.updatedAt),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tUserSavedSearchPK = [tUserSavedSearch.userId, tUserSavedSearch.id] as const;

/** Timestamp columns to exclude from upsert SET clauses */
export const tUserSavedSearchTimestampExclude = [
  tUserSavedSearch.rowCreatedAt,
  tUserSavedSearch.rowUpdatedAt,
] as const;

export type TUserSavedSearchS = InferSelectModel<typeof tUserSavedSearch>;
export type TUserSavedSearchI = OmitTimestampCols<InferInsertModel<typeof tUserSavedSearch>>;

export const sUserSavedSearchS = createSelectSchema(tUserSavedSearch);
export const sUserSavedSearchI = omitTimestampCols(createInsertSchema(tUserSavedSearch));
export const sUserSavedSearchU = omitTimestampCols(createUpdateSchema(tUserSavedSearch));
