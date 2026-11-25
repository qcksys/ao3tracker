import { describe, expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import {
  getPendingNotificationDispatches,
  recordNotificationDispatch,
} from "~/db/queries/notification";
import { mockQueries } from "./pg-query-mock";

describe("notification dispatch queries", () => {
  it("selects only explicit outbox rows and bounds each oldest-first drain", async () => {
    const db = createDbConnection("postgresql://unused:unused@localhost/unused");
    const execute = mockQueries(db);
    await getPendingNotificationDispatches(db);
    const [query, params] = execute.mock.calls[0];
    expect(query).toContain('"ao3track_local__notification"."dispatchPending" = $');
    expect(query).toContain("statement_timestamp() - interval '5 minutes'");
    expect(query).toContain(
      'order by "ao3track_local__notification"."rowUpdatedAt" asc, "ao3track_local__notification"."id" asc limit $',
    );
    expect(params).toEqual([true, 500]);

    await recordNotificationDispatch(db, [1, 2], "claim", "Queue unavailable");
    expect(execute.mock.calls[1][0]).toContain(
      '"retryCount" = "ao3track_local__notification"."retryCount" + 1',
    );
    expect(execute.mock.calls[1][0]).toContain('"rowUpdatedAt" = CURRENT_TIMESTAMP');
    expect(execute.mock.calls[1][1]).toEqual([
      true,
      null,
      null,
      "Queue unavailable",
      1,
      2,
      "claim",
    ]);

    await recordNotificationDispatch(db, [3], "claim");
    expect(execute.mock.calls[2][1]).toEqual([false, null, null, null, 3, "claim"]);
  });
});
