import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatMigrationError, runMigrations } from "../apps/api/scripts/migrate.mjs";
import { readMigrationManifest } from "./check-api-migrations.mjs";

void test("the real migrator uses the existing ledger and parameterized driver API", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    queries.push(JSON.parse(init.body).query);
    return Response.json({ result: { fields: [], rows: [] } });
  });

  await runMigrations("mysql://test:test@database.example/test");

  const { migrations } = await readMigrationManifest();
  const inserts = queries.filter((query) => query.startsWith("insert into"));
  assert.equal(inserts.length, migrations.length);
  for (const [index, query] of inserts.entries()) {
    assert.ok(query.includes("`ao3track__migrations`"));
    assert.ok(query.includes(String(migrations[index].when)));
    assert.ok(query.includes(migrations[index].tag));
    assert.ok(migrations[index].hashes.some((hash) => query.includes(hash)));
    assert.ok(!query.includes("?"));
  }
  assert.equal(queries.at(-1), "COMMIT");
});

void test("the RC migrator upgrades a legacy ledger without replaying applied SQL", async (t) => {
  const { migrations } = await readMigrationManifest();
  const queries = [];
  let named = false;
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    const query = JSON.parse(init.body).query;
    queries.push(query);
    let rows = [];
    if (query.includes("information_schema.tables")) rows = [{ exists: "1" }];
    else if (query.includes("information_schema.columns")) {
      rows = ["id", "hash", "created_at"].map((column_name) => ({ column_name }));
    } else if (/select.*from `ao3track__migrations`/i.test(query)) {
      rows = migrations.map((migration, index) => ({
        id: String(index + 1),
        hash: migration.hashes[0],
        created_at: String(migration.when + 543),
        ...(named ? { name: migration.tag } : {}),
      }));
    } else if (query.startsWith("UPDATE `ao3track__migrations`")) named = true;
    const names = Object.keys(rows[0] ?? {});
    return Response.json({
      result: {
        fields: names.map((name) => ({ name, type: "VARCHAR" })),
        rows: rows.map((row) => ({
          lengths: names.map((name) => String(row[name].length)),
          values: Buffer.from(names.map((name) => row[name]).join("")).toString("base64"),
        })),
      },
    });
  });

  await runMigrations("mysql://test:test@database.example/test");

  assert.equal(
    queries.filter((query) => query.startsWith("ALTER TABLE `ao3track__migrations`")).length,
    2,
  );
  assert.equal(
    queries.filter((query) => query.startsWith("UPDATE `ao3track__migrations`")).length,
    migrations.length,
  );
  for (const migration of migrations)
    assert.ok(queries.some((query) => query.startsWith("UPDATE") && query.includes(migration.tag)));
  assert.ok(!queries.some((query) => /^(create|insert|delete|drop)/i.test(query)));
  assert.equal(queries.at(-1), "COMMIT");
});

void test("migration errors include their cause without exposing connection credentials", () => {
  const url = "mysql://db-user:secret%21@database.example/test";
  const error = new Error(`Connection failed for ${url}`, {
    cause: new Error("Access denied for db-user using secret! or secret%21"),
  });
  const output = formatMigrationError(error, url);
  assert.match(output, /Caused by: Access denied/);
  for (const secret of [url, "db-user", "secret!", "secret%21"]) {
    assert.ok(!output.includes(secret));
  }
  assert.equal(
    formatMigrationError(
      new Error("Invalid credential bad%escape"),
      "mysql://user:bad%escape@host",
    ),
    "Invalid credential [REDACTED]",
  );
});

void test("the migration CLI prints the underlying failure and exits unsuccessfully", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../apps/api/scripts/migrate.mjs", import.meta.url))],
    {
      env: { ...process.env, DATABASE_URL: "http://fake-user:fake-password@127.0.0.1:1/test" },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Database migration failed/);
  assert.match(result.stderr, /Caused by: fetch failed/);
  assert.ok(!result.stderr.includes("fake-user"));
  assert.ok(!result.stderr.includes("fake-password"));
});
