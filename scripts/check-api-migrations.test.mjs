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
  { tag: "20260101000001_first", when: 1000, hashes: ["first-lf-hash", "first-crlf-hash"] },
  { tag: "20260101000002_second", when: 2000, hashes: ["second-lf-hash", "second-crlf-hash"] },
];
const history = migrations.map(({ when, hashes }) => ({
  created_at: String(when),
  hash: hashes[0],
}));
const snapshot = {
  ddl: [
    { entityType: "columns", table: "ao3track__work", name: "rowUpdatedAt", type: "datetime(3)" },
  ],
};
const columns = [
  {
    table_name: "ao3track__work",
    column_name: "rowUpdatedAt",
    data_type: "datetime",
    datetime_precision: "3",
  },
];

test("the checked-in migration folders retain their snapshot chain and latest schema", async () => {
  const manifest = await readMigrationManifest();
  assert.ok(manifest.migrations.length > 0);
  assert.ok(
    manifest.snapshot.ddl.some(
      (entity) =>
        entity.entityType === "columns" &&
        entity.table === "ao3track__auth_two_factor" &&
        entity.name === "lockedUntil",
    ),
  );
  let previousId = "00000000-0000-0000-0000-000000000000";
  for (const migration of manifest.migrations) {
    const snapshot = JSON.parse(
      await readFile(
        new URL(`../apps/api/src/db/migrations/${migration.tag}/snapshot.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(snapshot.prevIds, [previousId], `Migration order changed: ${migration.tag}`);
    previousId = snapshot.id;
  }
});

test("manifest checksums cover Linux and Windows checkouts of the actual migration SQL", async () => {
  const manifest = await readMigrationManifest();
  const migration = manifest.migrations[0];
  const text = await readFile(
    new URL(`../apps/api/src/db/migrations/${migration.tag}/migration.sql`, import.meta.url),
    "utf8",
  );
  for (const ending of ["\n", "\r\n"]) {
    const hash = createHash("sha256").update(text.split(/\r?\n/).join(ending)).digest("hex");
    assert.ok(migration.hashes.includes(hash));
  }
  const changed = createHash("sha256").update(`${text}\nSELECT 1;`).digest("hex");
  assert.equal(migration.hashes.includes(changed), false);
});

test("legacy ledger timestamps retain their milliseconds and may arrive in any order", () => {
  verifyMigrationHistory(migrations, history.toReversed());
  verifyMigrationHistory(
    migrations,
    history.map((row) => ({ ...row, created_at: Number(row.created_at) + 543 })),
  );
});

void test("RC ledgers must match names, timestamps and checksums", () => {
  const named = history.map((row, index) => ({ ...row, name: migrations[index].tag }));
  verifyMigrationHistory(migrations, named);
  for (const name of [null, "unknown", migrations[1].tag]) {
    assert.throws(
      () => verifyMigrationHistory(migrations, [{ ...named[0], name }, named[1]]),
      /unknown or duplicate/,
    );
  }
  assert.throws(
    () => verifyMigrationHistory(migrations, [{ ...named[0], created_at: 9000 }, named[1]]),
    /unknown or duplicate/,
  );
  assert.throws(
    () => verifyMigrationHistory(migrations, [{ ...named[0], hash: "changed" }, named[1]]),
    /checksum differs/,
  );
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
  assert.throws(() => verifyMigrationHistory(migrations, [history[1]]), /20260101000001_first/);
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

test("readiness detects legacy and RC ledgers using SELECT statements only", async () => {
  for (const hasNames of [false, true]) {
    const queries = [];
    await checkDatabaseReadiness(
      {
        async execute(sql) {
          queries.push(sql);
          return {
            rows:
              queries.length === 1
                ? [
                    ...columns,
                    ...(hasNames
                      ? [{ table_name: "ao3track__migrations", column_name: "name" }]
                      : []),
                  ]
                : history.map((row, index) =>
                    hasNames ? { ...row, name: migrations[index].tag } : row,
                  ),
          };
        },
      },
      { migrations, snapshot },
    );
    assert.equal(queries.length, 2);
    assert.ok(queries.every((sql) => /^SELECT\s/.test(sql) && !sql.includes(";")));
    assert.equal(queries[1].includes("created_at, name"), hasNames);
  }
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
