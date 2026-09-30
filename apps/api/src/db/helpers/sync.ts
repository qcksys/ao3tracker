import { gt, type SQL, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

export const incoming = (column: AnyMySqlColumn): SQL => sql`VALUES(${column})`;

export const replaceWhen = (column: AnyMySqlColumn, condition: SQL): SQL =>
  sql`IF(${condition}, ${incoming(column)}, ${column})`;

export const replaceWhenNewer = (column: AnyMySqlColumn, timestamp: AnyMySqlColumn): SQL =>
  replaceWhen(column, gt(incoming(timestamp), timestamp));

export const sameDate = (left: Date | null | undefined, right: Date | null | undefined): boolean =>
  (left?.getTime() ?? null) === (right?.getTime() ?? null);
