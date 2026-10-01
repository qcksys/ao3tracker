import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tagTypes = {
  unknown: 0,
  rating: 1,
  warning: 2,
  category: 3,
  fandom: 4,
  relationship: 5,
  character: 6,
  freeform: 7,
} as const;
export type TTagTypes = typeof tagTypes;
export type TTagType = keyof TTagTypes;
export type TTagTypeId = TTagTypes[TTagType];

export const tWorkTag = mysqlTable(
  `${DB_TABLE_PREFIX}work_tag`,
  {
    id: int({ unsigned: true }).autoincrement().primaryKey(),
    tag: varchar({ length: 255 }).notNull().unique(),
    href: varchar({ length: 255 }).notNull(),
    typeId: int({ unsigned: true }).$type<TTagTypeId>().notNull(),
  },
  (table) => {
    return [index("idx_tags_typeId").on(table.typeId)];
  },
);
/** Columns to exclude from upserts (auto-increment PK and unique key) */
export const tWorkTagUpsertExclude = [tWorkTag.id, tWorkTag.tag] as const;

export type TWorkTagS = InferSelectModel<typeof tWorkTag>;
export type TWorkTagI = InferInsertModel<typeof tWorkTag>;

export const sWorkTagS = createSelectSchema(tWorkTag);
export const sWorkTagI = createInsertSchema(tWorkTag);
export const sWorkTagU = createUpdateSchema(tWorkTag);
