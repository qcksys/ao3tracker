import type { QueryConfig } from "pg";
import { vi } from "vitest";
import type { TDatabase } from "~/db/db.client";

export function result(rows: unknown[] = [], rowCount = rows.length) {
  return { rows, rowCount, fields: [], command: "", oid: 0 };
}

export function mockQueries(db: TDatabase) {
  const execute = vi.fn<(text: string, params: unknown[]) => Promise<ReturnType<typeof result>>>();
  execute.mockResolvedValue(result());
  Object.assign(db.$client, {
    query: (config: QueryConfig, params: unknown[]) => execute(config.text, params),
  });
  return execute;
}
