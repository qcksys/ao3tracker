import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

export const tWorkTagLink = pgTable(
  `${DB_TABLE_PREFIX}work_tag_link`,
  {
    tag: bigint({ mode: "number" }).notNull(),
    work: bigint({ mode: "number" }).notNull(),
    rowCreatedAt: timestampCols.rowCreatedAt,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.tag, table.work] }),
      index(`${DB_TABLE_PREFIX}idx_tags_rowCreatedAt`).on(table.rowCreatedAt),
      index(`${DB_TABLE_PREFIX}idx_tags_work`).on(table.work),
    ];
  },
);
export const tWorkTagLinkPK = [tWorkTagLink.tag, tWorkTagLink.work] as const;
/** Columns to exclude from upserts (this table only has rowCreatedAt) */
export const tWorkTagLinkTimestampExclude = [tWorkTagLink.rowCreatedAt] as const;

export type TWorkTagLinkS = InferSelectModel<typeof tWorkTagLink>;
export type TWorkTagLinkI = OmitTimestampCols<InferInsertModel<typeof tWorkTagLink>>;

export const sWorkTagLinkS = createSelectSchema(tWorkTagLink);
export const sWorkTagLinkI = omitTimestampCols(createInsertSchema(tWorkTagLink));
export const sWorkTagLinkU = omitTimestampCols(createUpdateSchema(tWorkTagLink));
