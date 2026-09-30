import { type InferInsertModel, type InferSelectModel, relations, sql } from "drizzle-orm";
import { boolean, datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthPasskey } from "~/db/schema/auth.passkey";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthTwoFactor } from "~/db/schema/auth.twoFactor";

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

export const rAuthUser = relations(tAuthUser, ({ many }) => ({
  sessions: many(tAuthSession),
  accounts: many(tAuthAccount),
  twoFactors: many(tAuthTwoFactor),
  passkeys: many(tAuthPasskey),
}));

export type TAuthUserS = InferSelectModel<typeof tAuthUser>;
export type TAuthUserI = InferInsertModel<typeof tAuthUser>;

export const sAuthUserS = createSelectSchema(tAuthUser);
export const sAuthUserI = createInsertSchema(tAuthUser);
export const sAuthUserU = createUpdateSchema(tAuthUser);
