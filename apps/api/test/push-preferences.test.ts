import {
  defaultNotificationPreferences,
  notificationTypeSchema,
} from "@qcksys/ao3tracker-core/notifications";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { getTokensByUserIds } from "~/db/queries/push-token";
import type { TPushTokenS } from "~/db/schema/push.token";
import { FcmClient, sendNotificationsToUsers } from "~/lib/fcm-client";

vi.mock("~/db/queries/push-token", () => ({
  getTokensByUserIds: vi.fn(),
  invalidateToken: vi.fn(),
}));
const db = createDbConnection("mysql://test:test@database.example/test");
const token = (
  deviceId: string,
  preferences: TPushTokenS["notificationPreferences"],
): TPushTokenS => ({
  userId: "alice",
  deviceId,
  token: deviceId,
  platform: "android",
  notificationPreferences: preferences,
  lastValidatedAt: new Date(),
  rowCreatedAt: new Date(),
  rowUpdatedAt: new Date(),
  rowDeletedAt: null,
});

describe("device push preferences", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each(notificationTypeSchema.options)(
    "filters %s per device without muting another device",
    async (type) => {
      vi.mocked(getTokensByUserIds).mockResolvedValue([
        token("muted", { ...defaultNotificationPreferences, [type]: false }),
        token("enabled", defaultNotificationPreferences),
        token("legacy", null),
      ]);
      const send = vi
        .spyOn(FcmClient.prototype, "sendMulticast")
        .mockResolvedValue([{ success: true }, { success: true }]);
      const result = await sendNotificationsToUsers(db, "{}", ["alice"], {
        title: "Update",
        body: "Updated",
        data: { type },
      });
      expect(send.mock.calls[0][0]).toEqual(["enabled", "legacy"]);
      expect(result.sent).toBe(2);
    },
  );

  it("checks current preferences again for a queued device retry", async () => {
    const send = vi
      .spyOn(FcmClient.prototype, "sendMulticast")
      .mockResolvedValue([{ success: false, errorCode: "UNAVAILABLE" }]);
    const notification = { title: "Update", body: "Updated", data: { type: "new_chapters" } };
    vi.mocked(getTokensByUserIds).mockResolvedValue([
      token("phone", defaultNotificationPreferences),
    ]);
    expect(
      (await sendNotificationsToUsers(db, "{}", ["alice"], notification, "phone")).failed,
    ).toBe(1);
    vi.mocked(getTokensByUserIds).mockResolvedValue([
      token("phone", { ...defaultNotificationPreferences, enabled: false }),
    ]);
    expect(await sendNotificationsToUsers(db, "{}", ["alice"], notification, "phone")).toEqual({
      sent: 0,
      failed: 0,
      invalidTokensRemoved: 0,
    });
    expect(send).toHaveBeenCalledOnce();
  });
});
