import { afterEach, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { findActiveBackupByR2Key, findBackupsByWorkId } from "~/db/queries/backup";

afterEach(() => vi.unstubAllGlobals());

function database(withBackup = true) {
  const values = [
    "42/latest.epub",
    "42",
    "epub",
    "4294967296",
    "2026-09-30 10:00:00",
    "2026-10-01 11:00:00",
    "2026-10-01 11:00:00",
    null,
  ];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      result: {
        fields: [
          "r2Key",
          "workId",
          "format",
          "fileSize",
          "ao3UpdatedAt",
          "rowCreatedAt",
          "rowUpdatedAt",
          "rowDeletedAt",
        ].map((name) => ({
          name,
          type: name === "workId" ? "UINT32" : name === "fileSize" ? "UINT64" : "VARCHAR",
        })),
        rows: withBackup
          ? [
              {
                lengths: values.map((value) => String(value?.length ?? -1)),
                values: btoa(values.join("")),
              },
            ]
          : [],
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { db: createDbConnection("mysql://test:test@database.example/test"), fetchMock };
}

it("lists active backups in creation order and maps database numbers and UTC dates", async () => {
  const { db, fetchMock } = database();
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
  const { query } = await new Response(fetchMock.mock.calls[0][1]?.body).json<{ query: string }>();
  expect(query).toMatch(/`workId` = 42/);
  expect(query).toMatch(/`rowDeletedAt` is null/i);
  expect(query).toMatch(/order by .*`rowCreatedAt` desc/i);
});

it("finds a backup by key while excluding soft-deleted backups", async () => {
  const { db, fetchMock } = database();
  expect(await findActiveBackupByR2Key(db, "42/latest.epub")).toMatchObject({
    workId: 42,
    format: "epub",
  });
  const { query } = await new Response(fetchMock.mock.calls[0][1]?.body).json<{ query: string }>();
  expect(query).toMatch(/`r2Key` = '42\/latest.epub'/);
  expect(query).toMatch(/`rowDeletedAt` is null/i);
  expect(query).toMatch(/limit 1/i);
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
  expect(sql).toContain("`ao3track__work_tag_link`");
  expect(sql).toContain("`ao3track__work_tag`");
});
