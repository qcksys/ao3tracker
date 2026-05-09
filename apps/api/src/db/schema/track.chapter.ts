import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
} from "drizzle-orm";
import {
    datetime,
    float,
    index,
    int,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import {
    createInsertSchema,
    createSelectSchema,
    createUpdateSchema,
} from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import {
    type OmitTimestampCols,
    omitTimestampCols,
    timestampCols,
} from "~/db/helpers/schema";
import { tWork } from "~/db/schema/work";

export const tTrackChapter = mysqlTable(
    `${DB_TABLE_PREFIX}track_chapter`,
    {
        userId: varchar({ length: 36 }).notNull(),
        workId: int({ unsigned: true }).notNull(),
        chapterId: int({ unsigned: true }).notNull().default(0),
        lastReadAt: datetime().notNull(),
        markedCompleteAt: datetime(),
        readProgress: float({ unsigned: true }).notNull().default(0),
        ...timestampCols,
    },
    (table) => {
        return [
            primaryKey({
                columns: [table.userId, table.workId, table.chapterId],
            }),
            index("idx_track_chapter_lastReadAt").on(table.lastReadAt),
            index("idx_track_chapter_rowCreatedAt").on(table.rowCreatedAt),
            index("idx_track_chapter_rowUpdatedAt").on(table.rowUpdatedAt),
            index("idx_track_chapter_rowDeletedAt").on(table.rowDeletedAt),
            // Composite index for incremental sync queries
            index("idx_track_chapter_user_lastReadAt").on(
                table.userId,
                table.lastReadAt,
            ),
        ];
    },
);

/** Composite primary key target for upsert operations */
export const tTrackChapterPK = [
    tTrackChapter.userId,
    tTrackChapter.workId,
    tTrackChapter.chapterId,
] as const;
export const rTrackChapter = relations(tTrackChapter, ({ one }) => ({
    work: one(tWork, {
        fields: [tTrackChapter.workId],
        references: [tWork.id],
    }),
}));

export type TTrackChapterS = InferSelectModel<typeof tTrackChapter>;
export type TTrackChapterI = OmitTimestampCols<
    InferInsertModel<typeof tTrackChapter>
>;

export const sTrackChapterS = createSelectSchema(tTrackChapter);
export const sTrackChapterI = omitTimestampCols(
    createInsertSchema(tTrackChapter),
);
export const sTrackChapterU = omitTimestampCols(
    createUpdateSchema(tTrackChapter),
);
