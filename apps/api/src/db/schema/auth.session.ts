import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthSession = pgTable(
  `${DB_TABLE_PREFIX}auth_session`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    expiresAt: timestamp({ withTimezone: true, precision: 0 }).notNull(),
    token: varchar({ length: 255 }).notNull().unique(),
    createdAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, precision: 0 })
      .default(sql`statement_timestamp()`)
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: varchar({ length: 36 }).notNull(),
  },
  (table) => [index(`${DB_TABLE_PREFIX}session_userId_idx`).on(table.userId)],
);

export type TAuthSessionS = InferSelectModel<typeof tAuthSession>;
export type TAuthSessionI = InferInsertModel<typeof tAuthSession>;

export const sAuthSessionS = createSelectSchema(tAuthSession);
export const sAuthSessionI = createInsertSchema(tAuthSession);
export const sAuthSessionU = createUpdateSchema(tAuthSession);
