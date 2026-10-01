import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, datetime, index, int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthPasskey = mysqlTable(
  `${DB_TABLE_PREFIX}auth_passkey`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: varchar({ length: 36 }).notNull(),
    credentialID: varchar({ length: 255 }).notNull(),
    counter: int().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: datetime(),
    aaguid: text(),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

export type TAuthPasskeyS = InferSelectModel<typeof tAuthPasskey>;
export type TAuthPasskeyI = InferInsertModel<typeof tAuthPasskey>;

export const sAuthPasskeyS = createSelectSchema(tAuthPasskey);
export const sAuthPasskeyI = createInsertSchema(tAuthPasskey);
export const sAuthPasskeyU = createUpdateSchema(tAuthPasskey);
