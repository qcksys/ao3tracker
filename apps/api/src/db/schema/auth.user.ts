import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { boolean, datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthUser = mysqlTable(`${DB_TABLE_PREFIX}auth_user`, {
  id: varchar({ length: 36 }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  createdAt: datetime()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: datetime()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
    .notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export type TAuthUserS = InferSelectModel<typeof tAuthUser>;
export type TAuthUserI = InferInsertModel<typeof tAuthUser>;

export const sAuthUserS = createSelectSchema(tAuthUser);
export const sAuthUserI = createInsertSchema(tAuthUser);
export const sAuthUserU = createUpdateSchema(tAuthUser);
