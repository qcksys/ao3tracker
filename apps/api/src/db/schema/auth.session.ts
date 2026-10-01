import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { datetime, index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthSession = mysqlTable(
  `${DB_TABLE_PREFIX}auth_session`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    expiresAt: timestamp().notNull(),
    token: varchar({ length: 255 }).notNull().unique(),
    createdAt: datetime()
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: datetime()
      .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: varchar({ length: 36 }).notNull(),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export type TAuthSessionS = InferSelectModel<typeof tAuthSession>;
export type TAuthSessionI = InferInsertModel<typeof tAuthSession>;

export const sAuthSessionS = createSelectSchema(tAuthSession);
export const sAuthSessionI = createInsertSchema(tAuthSession);
export const sAuthSessionU = createUpdateSchema(tAuthSession);
