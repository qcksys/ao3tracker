import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthUser = pgTable(`${DB_TABLE_PREFIX}auth_user`, {
  id: varchar({ length: 36 }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  createdAt: timestamp({ withTimezone: true, precision: 0 })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true, precision: 0 })
    .default(sql`statement_timestamp()`)
    .notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  /** `admin` opens the /admin pages. Server-owned: Better Auth never accepts it as input. */
  role: varchar({ length: 32 }).notNull().default("user"),
});

export type TAuthUserS = InferSelectModel<typeof tAuthUser>;
export type TAuthUserI = InferInsertModel<typeof tAuthUser>;

export const sAuthUserS = createSelectSchema(tAuthUser);
export const sAuthUserI = createInsertSchema(tAuthUser);
export const sAuthUserU = createUpdateSchema(tAuthUser);
