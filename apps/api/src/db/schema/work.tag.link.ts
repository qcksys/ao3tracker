import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
} from "drizzle-orm";
import { index, int, mysqlTable, primaryKey } from "drizzle-orm/mysql-core";
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
import { tWorkTag } from "~/db/schema/work.tag";

export const tWorkTagLink = mysqlTable(
    `${DB_TABLE_PREFIX}work_tag_link`,
    {
        tag: int({ unsigned: true }).notNull(),
        work: int({ unsigned: true }).notNull(),
        rowCreatedAt: timestampCols.rowCreatedAt,
    },
    (table) => {
        return [
            primaryKey({ columns: [table.tag, table.work] }),
            index("idx_tags_rowCreatedAt").on(table.rowCreatedAt),
        ];
    },
);
export const tWorkTagLinkPK = [tWorkTagLink.tag, tWorkTagLink.work] as const;
/** Columns to exclude from upserts (this table only has rowCreatedAt) */
export const tWorkTagLinkTimestampExclude = [
    tWorkTagLink.rowCreatedAt,
] as const;
export const rWorkTagLink = relations(tWorkTagLink, ({ one }) => ({
    work: one(tWork, {
        fields: [tWorkTagLink.work],
        references: [tWork.id],
    }),
    tag: one(tWorkTag, {
        fields: [tWorkTagLink.tag],
        references: [tWorkTag.id],
    }),
}));

export type TWorkTagLinkS = InferSelectModel<typeof tWorkTagLink>;
export type TWorkTagLinkI = OmitTimestampCols<
    InferInsertModel<typeof tWorkTagLink>
>;

export const sWorkTagLinkS = createSelectSchema(tWorkTagLink);
export const sWorkTagLinkI = omitTimestampCols(
    createInsertSchema(tWorkTagLink),
);
export const sWorkTagLinkU = omitTimestampCols(
    createUpdateSchema(tWorkTagLink),
);
