import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { bigint, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import {
    createInsertSchema,
    createSelectSchema,
    createUpdateSchema,
} from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";

/**
 * Per-IP-per-endpoint rate-limit counters managed by Better Auth when
 * `rateLimit.storage = "database"`. We don't read or write this table
 * directly; Better Auth's drizzle adapter manages it. The schema must match
 * the shape Better Auth expects (id, key, count, lastRequest).
 */
export const tAuthRateLimit = mysqlTable(`${DB_TABLE_PREFIX}auth_rate_limit`, {
    id: varchar({ length: 36 }).primaryKey(),
    key: varchar({ length: 255 }).notNull().unique(),
    count: int().notNull().default(0),
    lastRequest: bigint({ mode: "number" }).notNull(),
});

export type TAuthRateLimitS = InferSelectModel<typeof tAuthRateLimit>;
export type TAuthRateLimitI = InferInsertModel<typeof tAuthRateLimit>;

export const sAuthRateLimitS = createSelectSchema(tAuthRateLimit);
export const sAuthRateLimitI = createInsertSchema(tAuthRateLimit);
export const sAuthRateLimitU = createUpdateSchema(tAuthRateLimit);
