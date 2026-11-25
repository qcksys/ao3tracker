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

export const tTrackWork = pgTable(
  `${DB_TABLE_PREFIX}track_work`,
  {
    userId: varchar({ length: 36 }).notNull(),
    workId: bigint({ mode: "number" }).notNull(),
    markedCompleteAt: timestamp({ withTimezone: true, precision: 3 }),
    private: boolean().notNull().default(false),
    subscribed: boolean().notNull().default(true),
    favourite: boolean().notNull().default(false),
    /** Per-field timestamp for LWW sync (null = use lastReadAt as fallback) */
    subscribedUpdatedAt: timestamp({ withTimezone: true, precision: 3 }),
    /** Per-field timestamp for LWW sync (null = use lastReadAt as fallback) */
    favouriteUpdatedAt: timestamp({ withTimezone: true, precision: 3 }),
    ...syncTimestampCols,
    lastReadAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.userId, table.workId] }),
      index(`${DB_TABLE_PREFIX}idx_track_work_lastReadAt`).on(table.lastReadAt),
      index(`${DB_TABLE_PREFIX}idx_track_work_private`).on(table.private),
      index(`${DB_TABLE_PREFIX}idx_track_work_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_track_work_rowUpdatedAt`).on(table.rowUpdatedAt),
      index(`${DB_TABLE_PREFIX}idx_track_work_rowDeletedAt`).on(table.rowDeletedAt),
      // Composite index for incremental sync queries
      index(`${DB_TABLE_PREFIX}idx_track_work_user_lastReadAt`).on(table.userId, table.lastReadAt),
      index(`${DB_TABLE_PREFIX}idx_track_work_subscribed`).on(table.subscribed),
      index(`${DB_TABLE_PREFIX}idx_track_work_favourite`).on(table.favourite),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tTrackWorkPK = [tTrackWork.userId, tTrackWork.workId] as const;

export type TTrackWorkS = InferSelectModel<typeof tTrackWork>;
export type TTrackWorkI = OmitTimestampCols<InferInsertModel<typeof tTrackWork>>;

export const sTrackWorkS = createSelectSchema(tTrackWork);
export const sTrackWorkI = omitTimestampCols(createInsertSchema(tTrackWork));
export const sTrackWorkU = omitTimestampCols(createUpdateSchema(tTrackWork));
