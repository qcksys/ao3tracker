import { gt, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const incoming = (column: AnyPgColumn): SQL => sql`excluded.${sql.identifier(column.name)}`;

export const replaceWhen = (column: AnyPgColumn, condition: SQL): SQL =>
  sql`CASE WHEN ${condition} THEN ${incoming(column)} ELSE ${column} END`;

export const replaceWhenNewer = (column: AnyPgColumn, timestamp: AnyPgColumn): SQL =>
  replaceWhen(column, gt(incoming(timestamp), timestamp));

export const sameDate = (left: Date | null | undefined, right: Date | null | undefined): boolean =>
  (left?.getTime() ?? null) === (right?.getTime() ?? null);
