import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/db.client";
import { getTokensByUserIds } from "~/db/queries/push-token";
import { sendNotificationsToUsers } from "~/lib/fcm-client";
import type { NotificationQueueMessage } from "~/lib/notification-service";
import { processNotificationQueue } from "~/queue/notification-consumer";

vi.mock("~/db/queries/push-token", () => ({ getTokensByUserIds: vi.fn() }));
vi.mock("~/lib/fcm-client", () => ({ sendNotificationsToUsers: vi.fn() }));

const db = {} as TDatabase;
const sendBatch = vi.fn();
const env = {
  NOTIFICATION_QUEUE: { sendBatch },
  FCM_SERVICE_ACCOUNT: "{}",
} as unknown as CloudflareBindings;
const body: NotificationQueueMessage = {
  type: "work_notification",
  workId: 123,
  notificationType: "new_chapters",
  title: "Chapter",
  body: "New chapter",
  payload: "{}",
  userIds: ["user"],
};
const delivery = (deviceId?: string) => ({
  id: deviceId ?? "batch",
  timestamp: new Date(),
  attempts: 1,
  body: { ...body, deviceId },
  ack: vi.fn(),
  retry: vi.fn(),
});

describe("notification queue retries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("fans out before sending so each device has an independent retry", async () => {
    vi.mocked(getTokensByUserIds).mockResolvedValue(
      ["a", "b"].map((deviceId) => ({
        userId: "user",
        deviceId,
        token: deviceId,
        platform: "android",
        lastValidatedAt: new Date(),
        rowCreatedAt: new Date(),
        rowUpdatedAt: new Date(),
        rowDeletedAt: null,
      })),
    );
    const message = delivery();
    await processNotificationQueue(message, env, db);
    expect(sendBatch).toHaveBeenCalledWith(
      ["a", "b"].map((deviceId) => ({ body: { ...body, deviceId } })),
    );
    expect(sendNotificationsToUsers).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
  });

  it("retries the failed device and acknowledges the successful device", async () => {
    vi.mocked(sendNotificationsToUsers)
      .mockResolvedValueOnce({
        sent: 1,
        failed: 0,
        invalidTokensRemoved: 0,
      })
      .mockResolvedValueOnce({
        sent: 0,
        failed: 1,
        invalidTokensRemoved: 0,
      });
    const successful = delivery("a");
    const failed = delivery("b");
    await processNotificationQueue(successful, env, db);
    await processNotificationQueue(failed, env, db);
    expect(successful.ack).toHaveBeenCalledOnce();
    expect(successful.retry).not.toHaveBeenCalled();
    expect(failed.ack).not.toHaveBeenCalled();
    expect(failed.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(vi.mocked(sendNotificationsToUsers).mock.calls.map((call) => call[4])).toEqual([
      "a",
      "b",
    ]);
  });

  it("acknowledges an invalidated token and retries fanout failures", async () => {
    vi.mocked(sendNotificationsToUsers).mockResolvedValue({
      sent: 0,
      failed: 1,
      invalidTokensRemoved: 1,
    });
    const invalid = delivery("a");
    await processNotificationQueue(invalid, env, db);
    expect(invalid.ack).toHaveBeenCalledOnce();
    expect(invalid.retry).not.toHaveBeenCalled();
    vi.mocked(getTokensByUserIds).mockRejectedValue(new Error("Database unavailable"));
    const batch = delivery();
    await processNotificationQueue(batch, env, db);
    expect(batch.ack).not.toHaveBeenCalled();
    expect(batch.retry).toHaveBeenCalledOnce();
  });
});
