import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthVerification = pgTable(
  `${DB_TABLE_PREFIX}auth_verification`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    identifier: varchar({ length: 255 }).notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true, precision: 3 }).notNull(),
    createdAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`statement_timestamp()`)
      .notNull(),
  },
  (table) => [index(`${DB_TABLE_PREFIX}verification_identifier_idx`).on(table.identifier)],
);

export type TAuthVerificationS = InferSelectModel<typeof tAuthVerification>;
export type TAuthVerificationI = InferInsertModel<typeof tAuthVerification>;

export const sAuthVerificationS = createSelectSchema(tAuthVerification);
export const sAuthVerificationI = createInsertSchema(tAuthVerification);
export const sAuthVerificationU = createUpdateSchema(tAuthVerification);
