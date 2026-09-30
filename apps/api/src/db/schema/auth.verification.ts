import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { datetime, index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthVerification = mysqlTable(
  `${DB_TABLE_PREFIX}auth_verification`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    identifier: varchar({ length: 255 }).notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ fsp: 3 }).notNull(),
    createdAt: datetime()
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: datetime()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export type TAuthVerificationS = InferSelectModel<typeof tAuthVerification>;
export type TAuthVerificationI = InferInsertModel<typeof tAuthVerification>;

export const sAuthVerificationS = createSelectSchema(tAuthVerification);
export const sAuthVerificationI = createInsertSchema(tAuthVerification);
export const sAuthVerificationU = createUpdateSchema(tAuthVerification);
