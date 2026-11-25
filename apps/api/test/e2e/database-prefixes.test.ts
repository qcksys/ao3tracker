import pg from "pg";
import { expect, inject, it } from "vitest";
import { databasePrefix } from "~/const";

it("migrates main, dev and local independently in one Postgres database", async () => {
  const db = new pg.Client({ connectionString: inject("databaseUrl") });
  await db.connect();
  try {
    await db.query("BEGIN");
    for (const environment of ["main", "dev", "local"]) {
      const prefix = databasePrefix(environment);
      const ledger = await db.query(`SELECT name FROM "${prefix}migrations" ORDER BY id`);
      expect(ledger.rows.some((row) => row.name.endsWith("_postgres-baseline"))).toBe(true);
      await db.query(`INSERT INTO "${prefix}app_setting" (key,value) VALUES ($1,$2::jsonb)`, [
        "prefix-test",
        JSON.stringify(environment),
      ]);
    }
    for (const environment of ["main", "dev", "local"]) {
      const data = await db.query(
        `SELECT value FROM "${databasePrefix(environment)}app_setting" WHERE key = $1`,
        ["prefix-test"],
      );
      expect(data.rows).toEqual([{ value: environment }]);
    }
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
