import { defaultNotificationPreferences } from "@qcksys/ao3tracker-core/notifications";
import { afterEach, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { upsertPushToken } from "~/db/queries/push-token";

afterEach(() => vi.unstubAllGlobals());

it("updates device preferences and preserves them when a legacy client refreshes its token", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ result: { fields: [], rows: [] } }));
  vi.stubGlobal("fetch", fetchMock);
  const db = createDbConnection("mysql://test:test@database.example/test");
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
  const queries = await Promise.all(
    fetchMock.mock.calls.map(
      async ([, init]) => (await new Response(init?.body).json<{ query: string }>()).query,
    ),
  );
  const update = (query: string) => query.split(/on duplicate key update/i)[1];
  expect(update(queries[0])).toContain("`notificationPreferences`");
  expect(update(queries[1])).not.toContain("`notificationPreferences`");
  expect(update(queries[0])).not.toContain("`rowCreatedAt`");
  expect(update(queries[0])).not.toContain("`rowUpdatedAt`");
});
