import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { nodePostgresUrl } from "~/db/connection-url";
import { createDbConnection } from "~/db/db.client";
import { mockQueries, result } from "./pg-query-mock";

it("uses trusted roots and hostname verification for PlanetScale system-root URLs", () => {
  const raw =
    "postgresql://user:p%40ss@example.test:6432/postgres?sslrootcert=system&application_name=api";
  const url = new URL(nodePostgresUrl(raw));
  expect(url.searchParams.has("sslrootcert")).toBe(false);
  expect(url.searchParams.get("sslmode")).toBe("verify-full");
  expect(url.searchParams.get("application_name")).toBe("api");
  expect(url.password).toBe("p%40ss");
  for (const suffix of ["", "?sslmode=disable", "?sslmode=verify-full&sslrootcert=custom.pem"]) {
    const other = `postgresql://localhost/test${suffix}`;
    expect(nodePostgresUrl(other)).toBe(other);
  }
});

it("passes parameters separately to node-postgres", async () => {
  const db = createDbConnection("postgresql://test@localhost/test");
  const query = mockQueries(db).mockResolvedValue(result([{ answer: 42 }]));
  const response = await db.execute<{ answer: number }>(sql`SELECT ${42} AS answer`);
  expect(response.rows).toEqual([{ answer: 42 }]);
  expect(query).toHaveBeenCalledWith("SELECT $1 AS answer", [42]);
});
