import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

/**
 * Operational settings changed at runtime with SQL rather than a deployment, one JSON value
 * per key. Each reader validates its own value.
 */
export const tAppSetting = mysqlTable(`${DB_TABLE_PREFIX}app_setting`, {
  key: varchar({ length: 64 }).notNull().primaryKey(),
  value: json().notNull(),
  ...timestampCols,
});

/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tAppSettingTimestampExclude = [
  tAppSetting.rowCreatedAt,
  tAppSetting.rowUpdatedAt,
] as const;

export type TAppSettingS = InferSelectModel<typeof tAppSetting>;
export type TAppSettingI = OmitTimestampCols<InferInsertModel<typeof tAppSetting>>;

export const sAppSettingS = createSelectSchema(tAppSetting);
export const sAppSettingI = omitTimestampCols(createInsertSchema(tAppSetting));
export const sAppSettingU = omitTimestampCols(createUpdateSchema(tAppSetting));
