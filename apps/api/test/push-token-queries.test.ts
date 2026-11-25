import { defaultNotificationPreferences } from "@qcksys/ao3tracker-core/notifications";
import { expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { upsertPushToken } from "~/db/queries/push-token";
import { mockQueries } from "./pg-query-mock";

it("updates device preferences and preserves them when a legacy client refreshes its token", async () => {
  const db = createDbConnection("postgresql://test:test@database.example/test");
  const execute = mockQueries(db);
  const registration = {
    userId: "alice",
    deviceId: "phone",
    token: "token",
    platform: "android",
    lastValidatedAt: new Date(),
  };
  await upsertPushToken(db, {
    ...registration,
    notificationPreferences: { ...defaultNotificationPreferences, enabled: false },
  });
  await upsertPushToken(db, registration);
  const queries = execute.mock.calls.map(([query]) => query);
  const update = (query: string) => query.split(/do update set/i)[1];
  expect(update(queries[0])).toContain('"notificationPreferences"');
  expect(update(queries[1])).not.toContain('"notificationPreferences"');
  expect(update(queries[0])).not.toContain('"rowCreatedAt"');
  expect(update(queries[0])).not.toContain('"rowUpdatedAt"');
});
