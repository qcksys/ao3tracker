import { sql } from "drizzle-orm";
import { datetime } from "drizzle-orm/mysql-core";
import type { ZodObject, ZodRawShape } from "zod";

/** All timestamp column names (for select type exclusion) */
export type TAllTimestampColNames =
    | "rowCreatedAt"
    | "rowUpdatedAt"
    | "rowDeletedAt";

/** DB-managed timestamp columns that should never be set in inserts/updates */
export type TTimestampColNames = "rowCreatedAt" | "rowUpdatedAt";

/** Utility type to omit DB-managed timestamp columns from insert types */
export type OmitTimestampCols<T> = Omit<T, TTimestampColNames>;

/** Omit DB-managed timestamp columns from a Zod schema */
export function omitTimestampCols<T extends ZodRawShape>(schema: ZodObject<T>) {
    // Zod v4 strict omit typing doesn't work with generics
    // biome-ignore lint/suspicious/noExplicitAny: required for generic omit wrapper
    const mask: any = { rowCreatedAt: true, rowUpdatedAt: true };
    return schema.omit(mask) as unknown as ZodObject<
        Omit<T, TTimestampColNames>
    >;
}

export const timestampCols = {
    rowCreatedAt: datetime().default(sql`CURRENT_TIMESTAMP`).notNull(),
    rowUpdatedAt: datetime()
        .default(sql`CURRENT_TIMESTAMP ON
        UPDATE CURRENT_TIMESTAMP`)
        .notNull(),
    rowDeletedAt: datetime(),
};
