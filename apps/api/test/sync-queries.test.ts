import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import {
  batchProcessChapters,
  batchProcessWorks,
  getServerLastUpdated,
  getTrackedWorksForSync,
  migrateSingleChapterTracking,
} from "~/db/queries/track";
import { batchUpsertFavouriteTags, getFavouriteTagsSince } from "~/db/queries/user-favourite-tag";
import { batchUpsertSavedSearches, getSavedSearchesSince } from "~/db/queries/user-saved-search";
import { upsertWorkTags } from "~/db/queries/work";
import { tTrackChapter } from "~/db/schema/track.chapter";
import { tTrackWork } from "~/db/schema/track.work";
import { tUserFavouriteTag } from "~/db/schema/user.favouriteTag";
import { tUserSavedSearch } from "~/db/schema/user.savedSearch";
import { mockQueries, result } from "./pg-query-mock";

const event = new Date("2026-09-30T10:00:00.200Z");
const after = new Date("2026-09-30T10:00:00.300Z");

function row(table: PgTable, data: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(table)).map((key) => {
    const value = data[key] ?? null;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

function database() {
  const db = createDbConnection("postgresql://review:review@localhost/review");
  const execute = mockQueries(db).mockResolvedValue(result());
  return { db, execute };
}

describe("sync mutation cursors", () => {
  it("lags the database clock beyond the autocommit timeout to replay late commits", async () => {
    const { db, execute } = database();
    execute.mockResolvedValue(result([{ watermark: after.getTime() }]));
    expect(await getServerLastUpdated(db)).toEqual(after);
    expect(execute.mock.calls[0][0]).toContain("extract(epoch FROM statement_timestamp())");
    expect(execute.mock.calls[0][1]).toEqual([960_000]);
    expect(execute.mock.calls[0][0]).not.toContain("lastReadAt");
  });

  it("discovers work, chapter, and metadata mutations with an inclusive boundary", async () => {
    const { db, execute } = database();
    await getTrackedWorksForSync(db, "reader", { since: after });
    const query = execute.mock.calls[0][0];
    for (const table of ["track_work", "track_chapter", "work", "work_chapter"]) {
      expect(query).toContain(`"ao3track_local__${table}"."rowUpdatedAt" >= $`);
    }
    expect(query).not.toContain('"lastReadAt" >');
    expect(query).toContain('"ao3track_local__track_chapter"."userId" = $');
  });

  it("uses ingestion timestamps to fetch late offline preference updates", async () => {
    const { db, execute } = database();
    await getFavouriteTagsSince(db, "reader", after);
    await getSavedSearchesSince(db, "reader", after);
    for (const [query] of execute.mock.calls) {
      expect(query).toContain('"rowUpdatedAt" >= $');
      expect(query).not.toContain('"updatedAt" >');
    }
  });

  it("clears all work tags before publishing the empty replacement", async () => {
    const { db, execute } = database();
    await upsertWorkTags(db, 42, []);
    expect(execute).toHaveBeenCalledTimes(2);
    const [deletion, publication] = execute.mock.calls;
    expect(deletion[0]).toBe(
      'delete from "ao3track_local__work_tag_link" where "ao3track_local__work_tag_link"."work" = $1',
    );
    expect(deletion[1]).toEqual([42]);
    expect(publication[0]).toContain(
      'update "ao3track_local__work" set "rowUpdatedAt" = CURRENT_TIMESTAMP(3)',
    );
    expect(publication[0]).toContain('where "ao3track_local__work"."id" = $');
    expect(publication[1]).toEqual([42]);
  });

  it("includes tombstones in a full sync after a client resets its old cursor", async () => {
    const { db, execute } = database();
    const timestamp = "2026-09-30T10:00:00.200Z";
    execute
      .mockResolvedValueOnce(
        result([[1, timestamp, null, false, true, false, null, null, timestamp]]),
      )
      .mockResolvedValueOnce(result([[1, 2, timestamp, null, 0, timestamp]]))
      .mockResolvedValueOnce(result([[1, "Removed", false, timestamp]]))
      .mockResolvedValueOnce(result([["search", "Removed", "/works", true, timestamp]]));

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

describe("single-chapter identity migration", () => {
  it("copies a reset through atomic LWW and retains the original identity as a tombstone", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(
      result([
        row(tTrackChapter, {
          userId: "reader",
          workId: 1,
          chapterId: 0,
          lastReadAt: event,
          readProgress: 0,
          markedCompleteAt: null,
        }),
      ]),
    );
    expect(await migrateSingleChapterTracking(db, 1, 11)).toBe(1);
    const [lookup, copy, retirement] = execute.mock.calls;
    expect(lookup[0]).not.toContain('"rowDeletedAt" is null');
    expect(copy[0]).toContain("on conflict");
    expect(copy[0]).not.toContain("GREATEST");
    expect(copy[1]).toEqual(["reader", 1, 11, null, 0, null, "2026-09-30T10:00:00.200Z"]);
    expect(retirement[0]).toContain('update "ao3track_local__track_chapter"');
    expect(retirement[0]).toContain('"ao3track_local__track_chapter"."lastReadAt" = $');
    expect(retirement[1]).toEqual([
      "2026-09-30T10:00:00.200Z",
      "2026-09-30T10:00:00.200Z",
      "reader",
      1,
      0,
      "2026-09-30T10:00:00.200Z",
    ]);
    expect(execute.mock.calls.every(([query]) => !query.startsWith("delete"))).toBe(true);
  });

  it("migrates deletions received before the work was known to have multiple chapters", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(
      result([
        row(tTrackChapter, {
          userId: "reader",
          workId: 1,
          chapterId: 0,
          lastReadAt: event,
          readProgress: 0,
          markedCompleteAt: null,
          rowDeletedAt: event,
        }),
      ]),
    );
    await migrateSingleChapterTracking(db, 1, 11);
    expect(execute.mock.calls[1][1]).toEqual([
      "reader",
      1,
      11,
      null,
      0,
      "2026-09-30T10:00:00.200Z",
      "2026-09-30T10:00:00.200Z",
    ]);
  });

  it.each([false, true])(
    "maps legacy chapter0 uploads, including newer offline deletion=%s",
    async (deleted) => {
      const { db, execute } = database();
      execute.mockResolvedValueOnce(result([[1, 11]]));
      expect(
        await batchProcessChapters(db, "reader", [
          { workId: 1, chapterId: 0, lastReadAt: event, readProgress: 0, deleted },
        ]),
      ).toEqual([{ workId: 1, chapterId: 0, status: "ignored" }]);
      const [, canonical, retirement] = execute.mock.calls;
      expect(canonical[1]).toEqual([
        "reader",
        1,
        11,
        null,
        0,
        deleted ? "2026-09-30T10:00:00.200Z" : null,
        "2026-09-30T10:00:00.200Z",
      ]);
      expect(canonical[0]).toContain(
        '"rowDeletedAt" = CASE WHEN excluded."lastReadAt" > "ao3track_local__track_chapter"."lastReadAt"',
      );
      expect(retirement[0]).toContain(
        '"rowDeletedAt" = CASE WHEN excluded."lastReadAt" >= "ao3track_local__track_chapter"."lastReadAt"',
      );
      expect(retirement[1]).toEqual([
        "reader",
        1,
        0,
        null,
        0,
        "2026-09-30T10:00:00.200Z",
        "2026-09-30T10:00:00.200Z",
      ]);
    },
  );

  it("does not treat returned retirement tombstones as newer canonical deletions", async () => {
    const { db, execute } = database();
    execute.mockResolvedValueOnce(result([[1, 11]]));
    await batchProcessChapters(db, "reader", [
      { workId: 1, chapterId: 0, lastReadAt: event, deleted: true },
    ]);
    const canonical = execute.mock.calls[1][0];
    expect(canonical).toContain(
      'excluded."lastReadAt" > "ao3track_local__track_chapter"."lastReadAt"',
    );
    expect(canonical).not.toContain(">=");
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
    expect(query).toContain("on conflict");
    expect(query).toContain(
      '"rowDeletedAt" = CASE WHEN excluded."lastReadAt" > "ao3track_local__track_work"."lastReadAt"',
    );
    expect(query).toMatch(/"ao3track_local__track_work"\."rowDeletedAt" is null\)* or/);
    expect(query.lastIndexOf('"lastReadAt" =')).toBeGreaterThan(
      query.lastIndexOf('"rowDeletedAt" ='),
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
    expect(execute.mock.calls[0][1]).toContain("2026-09-30T10:00:00.200Z");
  });

  it("falls back to the incoming reading clock for each winning preference", async () => {
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
    for (const field of ["favouriteUpdatedAt", "subscribedUpdatedAt"]) {
      expect(query).toContain(`COALESCE(excluded."${field}", excluded."lastReadAt")`);
      expect(query).toContain(`excluded."${field}" > "ao3track_local__track_work"."${field}"`);
    }
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
    expect(query).toContain('"readProgress" = CASE WHEN excluded."lastReadAt" >');
    expect(query).not.toContain("GREATEST");
    expect(query.lastIndexOf('"lastReadAt" =')).toBeGreaterThan(
      query.lastIndexOf('"readProgress" ='),
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
        '"rowDeletedAt" = CASE WHEN excluded."lastReadAt" > "ao3track_local__track_chapter"."lastReadAt"',
      );
      const params = execute.mock.calls[0][1];
      expect(
        Array.isArray(params) ? params.filter((value) => value === "2026-09-30T10:00:00.200Z") : [],
      ).toHaveLength(2);
      expect(query.lastIndexOf('"lastReadAt" =')).toBeGreaterThan(
        query.lastIndexOf('"rowDeletedAt" ='),
      );
    },
  );

  it("rejects a saved-search edit overtaken between its read and upsert", async () => {
    const { db, execute } = database();
    execute
      .mockResolvedValueOnce(result([["search", "2026-09-30T10:00:00.100Z"]]))
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
        `"${field}" = CASE WHEN excluded."updatedAt" > "ao3track_local__user_saved_search"."updatedAt"`,
      );
    }
    expect(query.lastIndexOf('"updatedAt" =')).toBeGreaterThan(query.lastIndexOf('"deleted" ='));
  });

  it("rejects a favourite-tag edit overtaken before its upsert", async () => {
    const { db, execute } = database();
    execute
      .mockResolvedValueOnce(result([[7, "Fluff", "2026-09-30T10:00:00.100Z"]]))
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
    expect(execute.mock.calls[1][0]).toContain('"favourited" = CASE WHEN excluded."updatedAt" >');
  });
});
