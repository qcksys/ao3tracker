import { getTableColumns, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { incoming } from "./sync";

// Postgres permits each conflict key only once per INSERT. Keep repeated updates in arrival order.
export function* upsertBatches<T>(rows: T[], key: (row: T) => string | number) {
  let start = 0;
  const keys = new Set<string | number>();
  for (const [index, row] of rows.entries()) {
    const id = key(row);
    if (keys.has(id)) {
      yield rows.slice(start, index);
      keys.clear();
      start = index;
    }
    keys.add(id);
  }
  if (start < rows.length) yield start === 0 ? rows : rows.slice(start);
}

export function excludedSet(table: PgTable, exclude: readonly AnyPgColumn[]) {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!exclude.includes(column) && !column.primary && !column.isUnique)
      set[key] = incoming(column);
  }
  return set;
}
