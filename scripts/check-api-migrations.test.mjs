import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  checkDatabaseReadiness,
  readMigrationManifest,
  verifyMigrationHistory,
  verifySchemaColumns,
} from "./check-api-migrations.mjs";

const migrations = [
  { tag: "0000_first", when: 100, hashes: ["first-lf-hash", "first-crlf-hash"] },
  { tag: "0001_second", when: 200, hashes: ["second-lf-hash", "second-crlf-hash"] },
];
const history = migrations.map(({ when, hashes }) => ({
  created_at: String(when),
  hash: hashes[0],
}));
const snapshot = {
  tables: {
    work: {
      name: "ao3track__work",
      columns: { rowUpdatedAt: { name: "rowUpdatedAt", type: "datetime(3)" } },
    },
  },
};
const columns = [
  {
    table_name: "ao3track__work",
    column_name: "rowUpdatedAt",
    data_type: "datetime",
    datetime_precision: "3",
  },
];

test("the checked-in SQL history has a complete journal and latest snapshot", async () => {
  const manifest = await readMigrationManifest();
  assert.ok(manifest.migrations.length > 0);
  assert.ok(manifest.snapshot.tables.ao3track__auth_two_factor.columns.lockedUntil);
});

test("manifest checksums cover Linux and Windows checkouts of the actual migration SQL", async () => {
  const manifest = await readMigrationManifest();
  const migration = manifest.migrations[0];
  const text = await readFile(
    new URL(`../apps/api/src/db/migrations/${migration.tag}.sql`, import.meta.url),
    "utf8",
  );
  for (const ending of ["\n", "\r\n"]) {
    const hash = createHash("sha256").update(text.split(/\r?\n/).join(ending)).digest("hex");
    assert.ok(migration.hashes.includes(hash));
  }
  const changed = createHash("sha256").update(`${text}\nSELECT 1;`).digest("hex");
  assert.equal(migration.hashes.includes(changed), false);
});

test("matching migration timestamps and checksums pass regardless of row order", () => {
  verifyMigrationHistory(migrations, history.toReversed());
});

test("historical Windows CRLF migration hashes are accepted without accepting edited SQL", () => {
  verifyMigrationHistory(
    migrations,
    migrations.map(({ when, hashes }) => ({ created_at: when, hash: hashes[1] })),
  );
  assert.throws(
    () =>
      verifyMigrationHistory(migrations, [{ ...history[0], hash: "different-sql" }, history[1]]),
    /checksum differs/,
  );
});

test("a latest timestamp cannot conceal an unapplied earlier migration", () => {
  assert.throws(() => verifyMigrationHistory(migrations, [history[1]]), /0000_first/);
});

test("edited, unknown and duplicate migration history fail closed", () => {
  assert.throws(
    () => verifyMigrationHistory(migrations, [{ ...history[0], hash: "changed" }, history[1]]),
    /checksum differs/,
  );
  assert.throws(
    () => verifyMigrationHistory(migrations, [...history, { created_at: 300, hash: "future" }]),
    /unknown or duplicate/,
  );
  assert.throws(() => verifyMigrationHistory(migrations, [...history, history[0]]), /duplicate/);
});

test("recorded migrations still require live columns and millisecond precision", () => {
  verifySchemaColumns(snapshot, columns);
  assert.throws(() => verifySchemaColumns(snapshot, []), /missing/);
  assert.throws(
    () => verifySchemaColumns(snapshot, [{ ...columns[0], datetime_precision: 0 }]),
    /datetime\(3\)/,
  );
  assert.throws(
    () => verifySchemaColumns(snapshot, [{ ...columns[0], data_type: "varchar" }]),
    /datetime\(3\)/,
  );
});

test("readiness executes SELECT statements only", async () => {
  const queries = [];
  await checkDatabaseReadiness(
    {
      async execute(sql) {
        queries.push(sql);
        return { rows: queries.length === 1 ? history : columns };
      },
    },
    { migrations, snapshot },
  );
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => /^SELECT\s/.test(sql) && !sql.includes(";")));
});

test("a missing ledger or connection error blocks deployment without leaking driver details", async () => {
  await assert.rejects(
    checkDatabaseReadiness(
      {
        async execute() {
          throw new Error("mysql://user:private-password@example.test:3306/database");
        },
      },
      { migrations, snapshot },
    ),
    (error) =>
      error.message.includes("Could not read") && !error.message.includes("private-password"),
  );
});
