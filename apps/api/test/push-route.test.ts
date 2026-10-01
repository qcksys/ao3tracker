import { defaultNotificationPreferences } from "@qcksys/ao3tracker-core/notifications";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { upsertPushToken } from "~/db/queries/push-token";
import { pushRouter } from "~/routes/api.push";

vi.mock("~/db/queries/push-token", () => ({ upsertPushToken: vi.fn(), deletePushToken: vi.fn() }));
const db = createDbConnection("mysql://test:test@database.example/test");
const app = new Hono<{ Variables: { user: { id: string }; db: typeof db } }>()
  .use("*", async (c, next) => {
    c.set("user", { id: "signed-in-user" });
    c.set("db", db);
    await next();
  })
  .route("/push", pushRouter);
const register = (extra: Record<string, unknown>) =>
  app.request("/push/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "token", deviceId: "phone", platform: "android", ...extra }),
  });

describe("push registration settings", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores and confirms preferences only for the authenticated user's device", async () => {
    const response = await register({
      userId: "another-user",
      notificationPreferences: { work_deleted: false },
    });
    const preferences = { ...defaultNotificationPreferences, work_deleted: false };
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, notificationPreferences: preferences });
    expect(upsertPushToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: "signed-in-user",
        deviceId: "phone",
        notificationPreferences: preferences,
      }),
    );
  });

  it("accepts older clients without resetting their device preferences", async () => {
    const response = await register({});
    expect(response.status).toBe(200);
    expect(vi.mocked(upsertPushToken).mock.calls[0][1].notificationPreferences).toBeUndefined();
  });

  it("rejects invalid preference values before writing", async () => {
    const response = await register({ notificationPreferences: { enabled: "false" } });
    expect(response.status).toBe(400);
    expect(upsertPushToken).not.toHaveBeenCalled();
  });
});
