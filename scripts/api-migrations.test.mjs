import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatMigrationError,
  postgresMigrations,
  runMigrations,
} from "../apps/api/scripts/migrate.mjs";

void test("the Postgres baseline isolates each environment's tables, types, indexes, sequences, triggers and migration ledger", () => {
  for (const [environment, prefix] of Object.entries({
    main: "ao3track__",
    dev: "ao3track_dev__",
    local: "ao3track_local__",
  })) {
    const { migrations, migrationsTable } = postgresMigrations(environment);
    assert.equal(migrationsTable, prefix + "migrations");
    const sql = migrations[0].sql.join("\n");
    for (const name of [
      "auth_user",
      "notification_type",
      "idx_notification_event",
      "notification_id_seq",
      "record_change",
    ]) {
      assert.ok(sql.includes('"' + prefix + name + '"'), name);
    }
    assert.ok([...sql.matchAll(/"(ao3track[^"]+)"/g)].every(([, name]) => name.startsWith(prefix)));
  }
  assert.throws(() => postgresMigrations("staging"), /Unknown database environment/);
});

void test("migration errors include their cause without exposing connection credentials", () => {
  const url = "postgresql://db-user:secret%21@database.example/test";
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
      "postgresql://user:bad%escape@host",
    ),
    "Invalid credential [REDACTED]",
  );
});

void test("migration CLI rejects the old MySQL connection string before connecting", async () => {
  await assert.rejects(runMigrations("mysql://user:password@localhost/db"), {
    message: "DATABASE_URL must be a Postgres connection string",
  });
});

void test("the migration CLI prints the underlying failure and exits unsuccessfully", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../apps/api/scripts/migrate.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://fake-user:fake-password@127.0.0.1:1/test",
      },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Database migration failed/);
  assert.match(result.stderr, /Caused by: connect \w+ 127\.0\.0\.1:1/);
  assert.ok(!result.stderr.includes("fake-user"));
  assert.ok(!result.stderr.includes("fake-password"));
});
