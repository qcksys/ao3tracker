import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, pgTable, primaryKey, real, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, syncTimestampCols } from "~/db/helpers/schema";

export const tTrackChapter = pgTable(
  `${DB_TABLE_PREFIX}track_chapter`,
  {
    userId: varchar({ length: 36 }).notNull(),
    workId: bigint({ mode: "number" }).notNull(),
    chapterId: bigint({ mode: "number" }).notNull().default(0),
    markedCompleteAt: timestamp({ withTimezone: true, precision: 3 }),
    readProgress: real().notNull().default(0),
    ...syncTimestampCols,
    lastReadAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.userId, table.workId, table.chapterId],
      }),
      index(`${DB_TABLE_PREFIX}idx_track_chapter_lastReadAt`).on(table.lastReadAt),
      index(`${DB_TABLE_PREFIX}idx_track_chapter_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_track_chapter_rowUpdatedAt`).on(table.rowUpdatedAt),
      index(`${DB_TABLE_PREFIX}idx_track_chapter_rowDeletedAt`).on(table.rowDeletedAt),
      // Composite index for incremental sync queries
      index(`${DB_TABLE_PREFIX}idx_track_chapter_user_lastReadAt`).on(
        table.userId,
        table.lastReadAt,
      ),
      // Chapter-zero migration looks up every user's rows for one work
      index(`${DB_TABLE_PREFIX}idx_track_chapter_work_chapter`).on(table.workId, table.chapterId),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tTrackChapterPK = [
  tTrackChapter.userId,
  tTrackChapter.workId,
  tTrackChapter.chapterId,
] as const;

export type TTrackChapterS = InferSelectModel<typeof tTrackChapter>;
export type TTrackChapterI = OmitTimestampCols<InferInsertModel<typeof tTrackChapter>>;

export const sTrackChapterS = createSelectSchema(tTrackChapter);
export const sTrackChapterI = omitTimestampCols(createInsertSchema(tTrackChapter));
export const sTrackChapterU = omitTimestampCols(createUpdateSchema(tTrackChapter));
