import { type InferInsertModel, type InferSelectModel, relations, sql } from "drizzle-orm";
import { datetime, index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import { tAuthUser } from "~/db/schema/auth.user";

export const tAuthAccount = mysqlTable(
  `${DB_TABLE_PREFIX}auth_account`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: varchar({ length: 36 }).notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: datetime()
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: datetime()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const rAuthAccount = relations(tAuthAccount, ({ one }) => ({
  user: one(tAuthUser, {
    fields: [tAuthAccount.userId],
    references: [tAuthUser.id],
  }),
}));

export type TAuthAccountS = InferSelectModel<typeof tAuthAccount>;
export type TAuthAccountI = InferInsertModel<typeof tAuthAccount>;

export const sAuthAccountS = createSelectSchema(tAuthAccount);
export const sAuthAccountI = createInsertSchema(tAuthAccount);
export const sAuthAccountU = createUpdateSchema(tAuthAccount);
