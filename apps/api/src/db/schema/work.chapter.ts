import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
} from "drizzle-orm";
import {
    datetime,
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

export const tWorkChapter = mysqlTable(
    `${DB_TABLE_PREFIX}work_chapter`,
    {
        id: int({ unsigned: true }).notNull(),
        workId: int({ unsigned: true }).notNull(),
        number: int({ unsigned: true }),
        title: varchar({ length: 255 }),
        dateUpdated: datetime(),
        ...timestampCols,
    },
    (table) => {
        return [
            primaryKey({ columns: [table.id, table.workId] }),
            index("idx_chapters_rowCreatedAt").on(table.rowCreatedAt),
            index("idx_chapters_rowUpdatedAt").on(table.rowUpdatedAt),
            index("idx_chapters_rowDeletedAt").on(table.rowDeletedAt),
        ];
    },
);

export const rWorkChapter = relations(tWorkChapter, ({ one }) => ({
    work: one(tWork, {
        fields: [tWorkChapter.workId],
        references: [tWork.id],
    }),
}));

export type TWorkChapterS = InferSelectModel<typeof tWorkChapter>;
export type TWorkChapterI = OmitTimestampCols<
    InferInsertModel<typeof tWorkChapter>
>;
/** Primary key columns for composite key upsert exclusion */
export const tWorkChapterPK = [tWorkChapter.id, tWorkChapter.workId] as const;
/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tWorkChapterTimestampExclude = [
    tWorkChapter.rowCreatedAt,
    tWorkChapter.rowUpdatedAt,
] as const;

export const sWorkChapterS = createSelectSchema(tWorkChapter);
export const sWorkChapterI = omitTimestampCols(
    createInsertSchema(tWorkChapter),
);
export const sWorkChapterU = omitTimestampCols(
    createUpdateSchema(tWorkChapter),
);
