import type { ExecutedQuery } from "@planetscale/database";
import { describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { claimStaleWorks, recordWorkRefreshFailure, updateWork } from "~/db/queries/work";

function result(rows: ExecutedQuery["rows"] = [], rowsAffected = 0): ExecutedQuery {
  return {
    rows,
    rowsAffected,
    insertId: "0",
    fields: [],
    headers: [],
    types: {},
    size: rows.length,
    statement: "",
    time: 0,
  };
}

describe("stale work claims", () => {
  const staleThreshold = new Date("2026-10-27T00:00:00Z");
  const retryAt = new Date("2026-10-27T00:30:00Z");

  it("selects the least recently refreshed works and returns only those it claimed", async () => {
    const db = createDbConnection("mysql://unused:unused@localhost/unused");
    const execute = vi
      .spyOn(db.$client, "execute")
      .mockResolvedValueOnce(
        result([
          [11, 3, 2],
          [22, 7, 0],
        ]),
      )
      .mockResolvedValueOnce(result([], 1))
      .mockResolvedValueOnce(result([], 0));

    expect(await claimStaleWorks(db, staleThreshold, retryAt, 12)).toEqual([
      { id: 11, currentChapters: 3, refreshFailures: 2 },
    ]);

    const [select, selectParams] = execute.mock.calls[0];
    expect(select).toContain("`ao3track__work`.`lastRefreshed` < ?");
    expect(select).toContain("`ao3track__work`.`rowDeletedAt` is null");
    expect(select).toContain(
      "order by `ao3track__work`.`lastRefreshed` asc, `ao3track__work`.`id` asc limit ?",
    );
    expect(selectParams).toContain(12);

    for (const [index, workId] of [
      [1, 11],
      [2, 22],
    ]) {
      const [update, params] = execute.mock.calls[index];
      expect(update).toContain("`rowUpdatedAt` = `ao3track__work`.`rowUpdatedAt`");
      expect(update).toContain("`ao3track__work`.`lastRefreshed` < ?");
      expect(update).toContain("`ao3track__work`.`rowDeletedAt` is null");
      expect(params).toContain(workId);
    }
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("does not update anything when no work is stale", async () => {
    const db = createDbConnection("mysql://unused:unused@localhost/unused");
    const execute = vi.spyOn(db.$client, "execute").mockResolvedValue(result());

    expect(await claimStaleWorks(db, staleThreshold, retryAt, 12)).toEqual([]);
    expect(execute).toHaveBeenCalledOnce();
  });
});

describe("refresh failure bookkeeping", () => {
  it("records the failure count and retry time without marking the work as changed", async () => {
    const db = createDbConnection("mysql://unused:unused@localhost/unused");
    const execute = vi.spyOn(db.$client, "execute").mockResolvedValue(result([], 1));

    await recordWorkRefreshFailure(db, 11, 3, new Date("2026-10-27T02:00:00Z"));

    const [update, params] = execute.mock.calls[0];
    expect(update).toContain("`refreshFailures` = ?");
    expect(update).toContain("`lastRefreshed` = ?");
    expect(update).toContain("`rowUpdatedAt` = `ao3track__work`.`rowUpdatedAt`");
    expect(params).toEqual(["2026-10-27 02:00:00.000", 3, 11]);
  });

  it("resets the failure count after a successful refresh", async () => {
    const db = createDbConnection("mysql://unused:unused@localhost/unused");
    const execute = vi.spyOn(db.$client, "execute").mockResolvedValue(result([], 1));

    await updateWork(db, 11, {
      title: "Work",
      author: "Author",
      language: "English",
      wordCount: 1000,
      currentChapters: 3,
      lastUpdated: new Date("2026-10-26T00:00:00Z"),
    });

    const [update, params] = execute.mock.calls[0];
    expect(update).toContain("`refreshFailures` = ?");
    expect(params).toContain(0);
  });
});
