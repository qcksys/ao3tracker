import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthPasskey = pgTable(
  `${DB_TABLE_PREFIX}auth_passkey`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: varchar({ length: 36 }).notNull(),
    credentialID: varchar({ length: 255 }).notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: timestamp({ withTimezone: true, precision: 0 }),
    aaguid: text(),
  },
  (table) => [
    index(`${DB_TABLE_PREFIX}passkey_userId_idx`).on(table.userId),
    index(`${DB_TABLE_PREFIX}passkey_credentialID_idx`).on(table.credentialID),
  ],
);

export type TAuthPasskeyS = InferSelectModel<typeof tAuthPasskey>;
export type TAuthPasskeyI = InferInsertModel<typeof tAuthPasskey>;

export const sAuthPasskeyS = createSelectSchema(tAuthPasskey);
export const sAuthPasskeyI = createInsertSchema(tAuthPasskey);
export const sAuthPasskeyU = createUpdateSchema(tAuthPasskey);
