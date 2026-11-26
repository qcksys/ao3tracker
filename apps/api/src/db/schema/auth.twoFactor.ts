import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthTwoFactor = pgTable(
  `${DB_TABLE_PREFIX}auth_two_factor`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    secret: varchar({ length: 255 }).notNull(),
    backupCodes: text().notNull(),
    userId: varchar({ length: 36 }).notNull(),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: timestamp({ withTimezone: true, precision: 3 }),
  },
  (table) => [
    index(`${DB_TABLE_PREFIX}twoFactor_secret_idx`).on(table.secret),
    index(`${DB_TABLE_PREFIX}twoFactor_userId_idx`).on(table.userId),
  ],
);

export type TAuthTwoFactorS = InferSelectModel<typeof tAuthTwoFactor>;
export type TAuthTwoFactorI = InferInsertModel<typeof tAuthTwoFactor>;

export const sAuthTwoFactorS = createSelectSchema(tAuthTwoFactor);
export const sAuthTwoFactorI = createInsertSchema(tAuthTwoFactor);
export const sAuthTwoFactorU = createUpdateSchema(tAuthTwoFactor);
