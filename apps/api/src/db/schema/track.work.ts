import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  boolean,
  datetime,
  index,
  int,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

export const tTrackWork = mysqlTable(
  `${DB_TABLE_PREFIX}track_work`,
  {
    userId: varchar({ length: 36 }).notNull(),
    workId: int({ unsigned: true }).notNull(),
    markedCompleteAt: datetime({ fsp: 3 }),
    private: boolean().notNull().default(false),
    subscribed: boolean().notNull().default(true),
    favourite: boolean().notNull().default(false),
    /** Per-field timestamp for LWW sync (null = use lastReadAt as fallback) */
    subscribedUpdatedAt: datetime({ fsp: 3 }),
    /** Per-field timestamp for LWW sync (null = use lastReadAt as fallback) */
    favouriteUpdatedAt: datetime({ fsp: 3 }),
    ...syncTimestampCols,
    // Drizzle emits MySQL upsert assignments in schema order. Compare
    // dependent fields against the old clock before assigning the new one.
    lastReadAt: datetime({ fsp: 3 }).notNull(),
  },
  (table) => {
    return [
      primaryKey({ columns: [table.userId, table.workId] }),
      index("idx_track_work_lastReadAt").on(table.lastReadAt),
      index("idx_track_work_private").on(table.private),
      index("idx_track_work_rowCreatedAt").on(table.rowCreatedAt),
      index("idx_track_work_rowUpdatedAt").on(table.rowUpdatedAt),
      index("idx_track_work_rowDeletedAt").on(table.rowDeletedAt),
      // Composite index for incremental sync queries
      index("idx_track_work_user_lastReadAt").on(table.userId, table.lastReadAt),
      index("idx_track_work_subscribed").on(table.subscribed),
      index("idx_track_work_favourite").on(table.favourite),
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
