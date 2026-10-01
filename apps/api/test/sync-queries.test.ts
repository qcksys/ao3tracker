import type { ExecutedQuery } from "@planetscale/database";
import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/db.client";
import {
  batchProcessChapters,
  batchProcessWorks,
  getServerLastUpdated,
  getTrackedWorksForSync,
} from "~/db/queries/track";
import { batchUpsertFavouriteTags, getFavouriteTagsSince } from "~/db/queries/user-favourite-tag";
import { batchUpsertSavedSearches, getSavedSearchesSince } from "~/db/queries/user-saved-search";
import { upsertWorkTags } from "~/db/queries/work";
import { tTrackChapter } from "~/db/schema/track.chapter";
import { tTrackWork } from "~/db/schema/track.work";
import { tUserFavouriteTag } from "~/db/schema/user.favouriteTag";
import { tUserSavedSearch } from "~/db/schema/user.savedSearch";

const event = new Date("2026-09-30T10:00:00.200Z");
const after = new Date("2026-09-30T10:00:00.300Z");

function result(rows: ExecutedQuery["rows"] = []): ExecutedQuery {
  return {
    rows,
    rowsAffected: 0,
    insertId: "0",
    fields: [],
    headers: [],
    types: {},
    size: rows.length,
    statement: "",
    time: 0,
  };
}

function row(table: MySqlTable, data: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(table)).map((key) => {
    const value = data[key] ?? null;
    if (value instanceof Date) return value.toISOString().slice(0, -1).replace("T", " ");
    return typeof value === "boolean" ? Number(value) : value;
  });
}

function database() {
  const db = createDbConnection("mysql://review:review@localhost/review");
  const execute = vi.spyOn(db.$client, "execute").mockResolvedValue(result());
  return { db, execute };
}

describe("sync mutation cursors", () => {
  it("lags the database clock beyond the autocommit timeout to replay late commits", async () => {
    const { db, execute } = database();
    execute.mockResolvedValue(result([{ watermark: after.toISOString() }]));
    expect(await getServerLastUpdated(db)).toEqual(after);
    expect(execute.mock.calls[0][0]).toContain("DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)");
    expect(execute.mock.calls[0][1]).toEqual([960]);
    expect(execute.mock.calls[0][0]).not.toContain("lastReadAt");
  });

  it("discovers work, chapter, and metadata mutations with an inclusive boundary", async () => {
    const { db, execute } = database();
    await getTrackedWorksForSync(db, "reader", { since: after });
    const query = execute.mock.calls[0][0];
    for (const table of ["track_work", "track_chapter", "work", "work_chapter"]) {
      expect(query).toContain(`\`ao3track__${table}\`.\`rowUpdatedAt\` >= ?`);
    }
    expect(query).not.toContain("`lastReadAt` >");
    expect(query).toContain("`ao3track__track_chapter`.`userId` = ?");
  });

  it("uses ingestion timestamps to fetch late offline preference updates", async () => {
    const { db, execute } = database();
    await getFavouriteTagsSince(db, "reader", after);
    await getSavedSearchesSince(db, "reader", after);
    for (const [query] of execute.mock.calls) {
      expect(query).toContain("`rowUpdatedAt` >= ?");
      expect(query).not.toContain("`updatedAt` >");
    }
  });

  it("clears all work tags before publishing the empty replacement", async () => {
    const { db, execute } = database();
    await upsertWorkTags(db, 42, []);
    expect(execute).toHaveBeenCalledTimes(2);
    const [deletion, publication] = execute.mock.calls;
    expect(deletion[0]).toBe(
      "delete from `ao3track__work_tag_link` where `ao3track__work_tag_link`.`work` = ?",
    );
    expect(deletion[1]).toEqual([42]);
    expect(publication[0]).toContain(
      "update `ao3track__work` set `rowUpdatedAt` = CURRENT_TIMESTAMP(3)",
    );
    expect(publication[0]).toContain("where `ao3track__work`.`id` = ?");
    expect(publication[1]).toEqual([42]);
  });

  it("includes tombstones in a full sync after a client resets its old cursor", async () => {
    const { db, execute } = database();
    const timestamp = "2026-09-30 10:00:00.200";
    execute
      .mockResolvedValueOnce(result([[1, timestamp, null, 0, 1, 0, null, null, timestamp]]))
      .mockResolvedValueOnce(result([[1, 2, timestamp, null, 0, timestamp]]))
      .mockResolvedValueOnce(result([[1, "Removed", 0, timestamp]]))
      .mockResolvedValueOnce(result([["search", "Removed", "/works", 1, timestamp]]));

    const tracked = await getTrackedWorksForSync(db, "reader");
    expect(tracked.works[0].rowDeletedAt).toEqual(event);
    expect(tracked.chapters[0].rowDeletedAt).toEqual(event);
    expect((await getFavouriteTagsSince(db, "reader", null))[0].favourited).toBe(false);
    expect((await getSavedSearchesSince(db, "reader", null))[0].deleted).toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
    for (const [query, params] of execute.mock.calls) {
      expect(query).not.toContain("is null");
      expect(params).toContain("reader");
    }
  });
});

describe("atomic sync writes", () => {
  it("does not acknowledge a stale upload over a newer deletion", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(result()).mockResolvedValueOnce(
      result([
        row(tTrackWork, {
          userId: "reader",
          workId: 1,
          private: false,
          subscribed: true,
          favourite: false,
          lastReadAt: after,
          rowDeletedAt: after,
        }),
      ]),
    );
    expect(await batchProcessWorks(db, "reader", [{ workId: 1, lastReadAt: event }])).toEqual([
      { workId: 1, status: "ignored" },
    ]);
    const query = execute.mock.calls[0][0];
    expect(query).toContain("on duplicate key update");
    expect(query).toContain(
      "`rowDeletedAt` = IF(VALUES(`ao3track__track_work`.`lastReadAt`) > `ao3track__track_work`.`lastReadAt`",
    );
    expect(query).toMatch(/`ao3track__track_work`\.`rowDeletedAt` is null\)* or/);
    expect(query.lastIndexOf("`lastReadAt` =")).toBeGreaterThan(
      query.lastIndexOf("`rowDeletedAt` ="),
    );
  });

  it("inserts a tombstone even if the work has never reached this server", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(result()).mockResolvedValueOnce(
      result([
        row(tTrackWork, {
          userId: "reader",
          workId: 1,
          lastReadAt: event,
          rowDeletedAt: event,
          private: false,
          subscribed: true,
          favourite: false,
        }),
      ]),
    );
    expect(
      await batchProcessWorks(db, "reader", [{ workId: 1, lastReadAt: event, deleted: true }]),
    ).toEqual([{ workId: 1, status: "deleted" }]);
    expect(execute.mock.calls[0][0]).toMatch(/^insert into/);
    expect(execute.mock.calls[0][1]).toContain("2026-09-30 10:00:00.200");
  });

  it("keeps preference comparisons ahead of their fallback reading clock", async () => {
    const { db, execute } = database();
    await batchProcessWorks(db, "reader", [
      {
        workId: 1,
        lastReadAt: event,
        favourite: true,
        favouriteUpdatedAt: after,
      },
    ]);
    const query = execute.mock.calls[0][0];
    expect(query.lastIndexOf("`favourite` =")).toBeLessThan(
      query.lastIndexOf("`favouriteUpdatedAt` ="),
    );
    expect(query.lastIndexOf("`subscribed` =")).toBeLessThan(
      query.lastIndexOf("`subscribedUpdatedAt` ="),
    );
    expect(query.lastIndexOf("`favouriteUpdatedAt` =")).toBeLessThan(
      query.lastIndexOf("`lastReadAt` ="),
    );
  });

  it("accepts a newer mark-unread chapter reset without clamping to previous progress", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(result()).mockResolvedValueOnce(
      result([
        row(tTrackChapter, {
          userId: "reader",
          workId: 1,
          chapterId: 2,
          lastReadAt: event,
          readProgress: 0,
        }),
      ]),
    );
    expect(
      await batchProcessChapters(db, "reader", [
        { workId: 1, chapterId: 2, lastReadAt: event, readProgress: 0 },
      ]),
    ).toEqual([{ workId: 1, chapterId: 2, status: "accepted" }]);
    const query = execute.mock.calls[0][0];
    expect(query).toContain("`readProgress` = IF(VALUES(`ao3track__track_chapter`.`lastReadAt`) >");
    expect(query).not.toContain("GREATEST");
    expect(query.lastIndexOf("`lastReadAt` =")).toBeGreaterThan(
      query.lastIndexOf("`readProgress` ="),
    );
  });

  it.each([
    { storedDeleted: false, storedTime: after, expected: "ignored" },
    { storedDeleted: true, storedTime: event, expected: "accepted" },
  ])(
    "orders chapter deletions by their mutation timestamp: $expected",
    async ({ storedDeleted, storedTime, expected }) => {
      const { db, execute } = database();
      execute.mockResolvedValueOnce(result()).mockResolvedValueOnce(
        result([
          row(tTrackChapter, {
            userId: "reader",
            workId: 1,
            chapterId: 2,
            lastReadAt: storedTime,
            readProgress: 0,
            rowDeletedAt: storedDeleted ? storedTime : null,
          }),
        ]),
      );
      expect(
        await batchProcessChapters(db, "reader", [
          {
            workId: 1,
            chapterId: 2,
            lastReadAt: event,
            readProgress: 0,
            deleted: true,
          },
        ]),
      ).toEqual([{ workId: 1, chapterId: 2, status: expected }]);
      const query = execute.mock.calls[0][0];
      expect(query).toContain(
        "`rowDeletedAt` = IF(VALUES(`ao3track__track_chapter`.`lastReadAt`) > `ao3track__track_chapter`.`lastReadAt`",
      );
      const params = execute.mock.calls[0][1];
      expect(
        Array.isArray(params) ? params.filter((value) => value === "2026-09-30 10:00:00.200") : [],
      ).toHaveLength(2);
      expect(query.lastIndexOf("`lastReadAt` =")).toBeGreaterThan(
        query.lastIndexOf("`rowDeletedAt` ="),
      );
    },
  );

  it("rejects a saved-search edit overtaken between its read and upsert", async () => {
    const { db, execute } = database();
    execute
      .mockResolvedValueOnce(result([["search", "2026-09-30 10:00:00.100"]]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(
        result([
          row(tUserSavedSearch, {
            userId: "reader",
            id: "search",
            name: "Newest",
            url: "https://archiveofourown.org/works",
            deleted: true,
            updatedAt: after,
          }),
        ]),
      );
    const savedSearch = {
      id: "search",
      name: "Older",
      url: "https://archiveofourown.org/works",
      deleted: false,
      updatedAt: event,
    };
    expect(await batchUpsertSavedSearches(db, "reader", [savedSearch])).toEqual([
      { id: "search", status: "ignored" },
    ]);
    const query = execute.mock.calls[1][0];
    for (const field of ["name", "url", "deleted", "updatedAt"]) {
      expect(query).toContain(
        `\`${field}\` = IF(VALUES(\`ao3track__user_saved_search\`.\`updatedAt\`) > \`ao3track__user_saved_search\`.\`updatedAt\``,
      );
    }
    expect(query.lastIndexOf("`updatedAt` =")).toBeGreaterThan(query.lastIndexOf("`deleted` ="));
  });

  it("rejects a favourite-tag edit overtaken before its upsert", async () => {
    const { db, execute } = database();
    execute
      .mockResolvedValueOnce(result([[7, "Fluff", "2026-09-30 10:00:00.100"]]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(
        result([
          row(tUserFavouriteTag, {
            userId: "reader",
            tagType: 7,
            tag: "Fluff",
            favourited: false,
            updatedAt: after,
          }),
        ]),
      );
    expect(
      await batchUpsertFavouriteTags(db, "reader", [
        {
          tagType: 7,
          tag: "Fluff",
          favourited: true,
          updatedAt: event,
        },
      ]),
    ).toEqual([{ tagType: 7, tag: "Fluff", status: "ignored" }]);
    expect(execute.mock.calls[1][0]).toContain(
      "`favourited` = IF(VALUES(`ao3track__user_favourite_tag`.`updatedAt`) >",
    );
  });
});
