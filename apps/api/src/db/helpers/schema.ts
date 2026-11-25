import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";
import type { ZodObject, ZodRawShape } from "zod";

/** All timestamp column names (for select type exclusion) */
export type TAllTimestampColNames = "rowCreatedAt" | "rowUpdatedAt" | "rowDeletedAt";

/** DB-managed timestamp columns that should never be set in inserts/updates */
export type TTimestampColNames = "rowCreatedAt" | "rowUpdatedAt";

/** Utility type to omit DB-managed timestamp columns from insert types */
export type OmitTimestampCols<T> = Omit<T, TTimestampColNames>;

/** Omit DB-managed timestamp columns from a Zod schema */
export function omitTimestampCols<T extends ZodRawShape>(schema: ZodObject<T>) {
  // Zod v4 strict omit typing doesn't work with generics
  // biome-ignore lint/suspicious/noExplicitAny: required for generic omit wrapper
  const mask: any = {};
  if (Object.hasOwn(schema.shape, "rowCreatedAt")) mask.rowCreatedAt = true;
  if (Object.hasOwn(schema.shape, "rowUpdatedAt")) mask.rowUpdatedAt = true;
  return schema.omit(mask) as unknown as ZodObject<Omit<T, TTimestampColNames>>;
}

export const timestampCols = {
  rowCreatedAt: timestamp({ withTimezone: true, precision: 0 })
    .default(sql`statement_timestamp()`)
    .notNull(),
  rowUpdatedAt: timestamp({ withTimezone: true, precision: 0 })
    .default(sql`statement_timestamp()`)
    .notNull(),
  rowDeletedAt: timestamp({ withTimezone: true, precision: 0 }),
};

export const syncTimestampCols = {
  rowCreatedAt: timestamp({ withTimezone: true, precision: 3 })
    .default(sql`statement_timestamp()`)
    .notNull(),
  rowUpdatedAt: timestamp({ withTimezone: true, precision: 3 })
    .default(sql`statement_timestamp()`)
    .notNull(),
  rowDeletedAt: timestamp({ withTimezone: true, precision: 3 }),
};
