import type { ExecutedQuery } from "@planetscale/database";
import { describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import {
  getPendingNotificationDispatches,
  recordNotificationDispatch,
} from "~/db/queries/notification";

describe("notification dispatch queries", () => {
  it("selects only explicit outbox rows and bounds each oldest-first drain", async () => {
    const db = createDbConnection("mysql://unused:unused@localhost/unused");
    const result: ExecutedQuery = {
      rows: [],
      rowsAffected: 0,
      insertId: "0",
      fields: [],
      headers: [],
      types: {},
      size: 0,
      statement: "",
      time: 0,
    };
    const execute = vi.spyOn(db.$client, "execute").mockResolvedValue(result);
    await getPendingNotificationDispatches(db);
    const [query, params] = execute.mock.calls[0];
    expect(query).toContain("where `ao3track__notification`.`dispatchPending` = ?");
    expect(query).toContain(
      "order by `ao3track__notification`.`rowUpdatedAt` asc, `ao3track__notification`.`id` asc limit ?",
    );
    expect(params).toEqual([true, 500]);

    await recordNotificationDispatch(db, [1, 2], "Queue unavailable");
    expect(execute.mock.calls[1][0]).toContain(
      "`retryCount` = `ao3track__notification`.`retryCount` + 1",
    );
    expect(execute.mock.calls[1][0]).toContain("`rowUpdatedAt` = CURRENT_TIMESTAMP");
    expect(execute.mock.calls[1][1]).toEqual([true, "Queue unavailable", 1, 2]);

    await recordNotificationDispatch(db, [3]);
    expect(execute.mock.calls[2][1]).toEqual([false, null, 3]);
  });
});
