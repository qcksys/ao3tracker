import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";
import { type TTagTypeId, tagTypes } from "~/db/schema/work.tag";

/**
 * Per-user, per-tag favourite state for filter chip pinning.
 *
 * Tombstones-in-place: unfavouriting sets `favourited = false` rather than deleting.
 * The live set is `WHERE favourited = true`. The sync delta is
 * `WHERE rowUpdatedAt >= lastSyncedAt`, which returns late offline adds and removes.
 *
 * `tagType` matches the integer ids in `tagTypes` (and `TagType.id` on the KMP client).
 */
export const tUserFavouriteTag = pgTable(
  `${DB_TABLE_PREFIX}user_favourite_tag`,
  {
    userId: varchar({ length: 36 }).notNull(),
    tagType: bigint({ mode: "number" }).$type<TTagTypeId>().notNull(),
    tag: varchar({ length: 191 }).notNull(),
    favourited: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
    ...syncTimestampCols,
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.userId, table.tagType, table.tag],
      }),
      // Composite index supporting incremental delta queries
      index(`${DB_TABLE_PREFIX}idx_user_favourite_tag_user_updatedAt`).on(
        table.userId,
        table.updatedAt,
      ),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tUserFavouriteTagPK = [
  tUserFavouriteTag.userId,
  tUserFavouriteTag.tagType,
  tUserFavouriteTag.tag,
] as const;

/** Timestamp columns to exclude from upsert SET clauses */
export const tUserFavouriteTagTimestampExclude = [
  tUserFavouriteTag.rowCreatedAt,
  tUserFavouriteTag.rowUpdatedAt,
] as const;

export type TUserFavouriteTagS = InferSelectModel<typeof tUserFavouriteTag>;
export type TUserFavouriteTagI = OmitTimestampCols<InferInsertModel<typeof tUserFavouriteTag>>;

export const sUserFavouriteTagS = createSelectSchema(tUserFavouriteTag);
export const sUserFavouriteTagI = omitTimestampCols(createInsertSchema(tUserFavouriteTag));
export const sUserFavouriteTagU = omitTimestampCols(createUpdateSchema(tUserFavouriteTag));

// Re-export tagTypes so callers can reference it from this module for convenience
export { tagTypes };
