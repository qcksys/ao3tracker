import { expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { findActiveBackupByR2Key, findBackupsByWorkId } from "~/db/queries/backup";
import { mockQueries, result } from "./pg-query-mock";

function database(withBackup = true) {
  const values = [
    "42/latest.epub",
    "42",
    "epub",
    "4294967296",
    "2026-09-30T10:00:00Z",
    "2026-10-01T11:00:00Z",
    "2026-10-01T11:00:00Z",
    null,
  ];
  const db = createDbConnection("postgresql://test:test@database.example/test");
  const query = mockQueries(db).mockResolvedValue(result(withBackup ? [values] : []));
  return { db, query };
}

it("lists active backups in creation order and maps database numbers and UTC dates", async () => {
  const { db, query: execute } = database();
  expect(await findBackupsByWorkId(db, 42)).toEqual([
    {
      r2Key: "42/latest.epub",
      workId: 42,
      format: "epub",
      fileSize: 4294967296,
      ao3UpdatedAt: new Date("2026-09-30T10:00:00Z"),
      rowCreatedAt: new Date("2026-10-01T11:00:00Z"),
      rowUpdatedAt: new Date("2026-10-01T11:00:00Z"),
      rowDeletedAt: null,
    },
  ]);
  const [query, params] = execute.mock.calls[0];
  expect(query).toContain('"workId" = $1');
  expect(params).toContain(42);
  expect(query).toMatch(/"rowDeletedAt" is null/i);
  expect(query).toMatch(/order by .*"rowCreatedAt" desc/i);
});

it("finds a backup by key while excluding soft-deleted backups", async () => {
  const { db, query: execute } = database();
  expect(await findActiveBackupByR2Key(db, "42/latest.epub")).toMatchObject({
    workId: 42,
    format: "epub",
  });
  const [query, params] = execute.mock.calls[0];
  expect(query).toContain('"r2Key" = $1');
  expect(params).toContain("42/latest.epub");
  expect(query).toMatch(/"rowDeletedAt" is null/i);
  expect(query).toMatch(/limit \$2/i);
});

it("returns null when a backup is missing or deleted", async () => {
  const { db } = database(false);
  expect(await findActiveBackupByR2Key(db, "42/deleted.epub")).toBeNull();
});

it("resolves nested work tags through the central relations without column-name collisions", () => {
  const { db } = database(false);
  const { sql } = db.query.tWork
    .findMany({ with: { tags: { with: { tagRecord: true } } } })
    .toSQL();
  expect(sql).toContain('"ao3track_local__work_tag_link"');
  expect(sql).toContain('"ao3track_local__work_tag"');
});
