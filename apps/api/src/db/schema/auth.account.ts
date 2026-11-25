import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthAccount = pgTable(
  `${DB_TABLE_PREFIX}auth_account`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: varchar({ length: 36 }).notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true, precision: 0 }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true, precision: 0 }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`statement_timestamp()`)
      .notNull(),
  },
  (table) => [index(`${DB_TABLE_PREFIX}account_userId_idx`).on(table.userId)],
);

export type TAuthAccountS = InferSelectModel<typeof tAuthAccount>;
export type TAuthAccountI = InferInsertModel<typeof tAuthAccount>;

export const sAuthAccountS = createSelectSchema(tAuthAccount);
export const sAuthAccountI = createInsertSchema(tAuthAccount);
export const sAuthAccountU = createUpdateSchema(tAuthAccount);
