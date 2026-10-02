import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import {
  getPendingNotificationDispatches,
  getSubscribedUsersForWork,
  hasRecentNotificationForWork,
  insertNotifications,
  recordNotificationDispatch,
} from "~/db/queries/notification";
import type { TNotificationS } from "~/db/schema/notification";
import {
  createWorkNotifications,
  dispatchPendingNotifications,
  type NotificationQueueMessage,
} from "~/lib/notification-service";
import { scheduled } from "~/scheduled/handler";

vi.mock("~/db/queries/notification", () => ({
  getPendingNotificationDispatches: vi.fn(),
  getSubscribedUsersForWork: vi.fn(),
  hasRecentNotificationForWork: vi.fn(),
  insertNotifications: vi.fn(),
  recordNotificationDispatch: vi.fn(),
}));

vi.mock("~/scheduled/refresh-works", () => ({ refreshStaleWorks: vi.fn() }));
vi.mock("~/scheduled/fetch-missing-works", () => ({ fetchMissingWorks: vi.fn() }));

const db = {} as TDatabase;
const sendBatch = vi.fn();
const queue = { sendBatch } as unknown as Queue<NotificationQueueMessage>;
const event = {
  workId: 12,
  workTitle: "Story",
  type: "new_chapters" as const,
  oldChapters: 1,
  newChapters: 2,
};

function notification(id: number): TNotificationS {
  return {
    id,
    userId: `reader-${id}`,
    workId: 12,
    type: "new_chapters",
    status: "pending",
    dispatchPending: true,
    title: "New chapter",
    body: "Story updated",
    payload: "{}",
    sentAt: null,
    fcmMessageId: null,
    errorMessage: null,
    retryCount: 0,
    rowCreatedAt: new Date(),
    rowUpdatedAt: new Date(),
    rowDeletedAt: null,
  };
}

describe("notification dispatch outbox", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSubscribedUsersForWork).mockResolvedValue(["reader-1"]);
    vi.mocked(getPendingNotificationDispatches).mockResolvedValue([notification(1)]);
  });

  it("keeps failed sends durable and retries them without another work update", async () => {
    sendBatch.mockRejectedValueOnce(new Error("Queue unavailable"));
    expect(await createWorkNotifications(db, queue, event)).toBe(1);
    expect(insertNotifications).toHaveBeenCalledWith(db, [
      expect.objectContaining({ dispatchPending: true }),
    ]);
    expect(recordNotificationDispatch).toHaveBeenCalledWith(db, [1], "Queue unavailable");

    await dispatchPendingNotifications(db, queue);
    expect(getPendingNotificationDispatches).toHaveBeenLastCalledWith(db, undefined);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(recordNotificationDispatch).toHaveBeenLastCalledWith(db, [1]);
    expect(insertNotifications).toHaveBeenCalledTimes(1);
  });

  it("retries pending deliveries when an event is deduplicated", async () => {
    vi.mocked(hasRecentNotificationForWork).mockResolvedValue(true);
    expect(await createWorkNotifications(db, queue, event)).toBe(0);
    expect(insertNotifications).not.toHaveBeenCalled();
    expect(sendBatch).toHaveBeenCalledOnce();
  });

  it("retains only failed batches and continues dispatching later batches", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => notification(index + 1));
    vi.mocked(getPendingNotificationDispatches).mockResolvedValue(rows);
    sendBatch.mockRejectedValueOnce(new Error("Temporary failure"));
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 1]);
    expect(vi.mocked(recordNotificationDispatch).mock.calls).toEqual([
      [db, rows.slice(0, 100).map(({ id }) => id), "Temporary failure"],
      [db, rows.slice(100, 200).map(({ id }) => id)],
      [db, [201]],
    ]);
  });

  it("does not queue rows when notification persistence fails", async () => {
    vi.mocked(insertNotifications).mockRejectedValue(new Error("Database unavailable"));
    await expect(createWorkNotifications(db, queue, event)).rejects.toThrow("Database unavailable");
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("drains pending deliveries on cron independently of work refreshes", async () => {
    const promises: Promise<unknown>[] = [];
    await scheduled(
      { cron: "*/5 * * * *" } as ScheduledEvent,
      {
        DATABASE_URL: "mysql://unused:unused@localhost/unused",
        NOTIFICATION_QUEUE: queue,
      } as unknown as CloudflareBindings,
      {
        waitUntil: (promise: Promise<unknown>) => promises.push(promise),
      } as unknown as ExecutionContext,
    );
    await Promise.all(promises);
    expect(sendBatch).toHaveBeenCalledOnce();
    expect(insertNotifications).not.toHaveBeenCalled();
  });

  it("leaves records retryable if acknowledging the queue handoff fails", async () => {
    vi.mocked(recordNotificationDispatch).mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(dispatchPendingNotifications(db, queue)).rejects.toThrow("Database unavailable");
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch).toHaveBeenCalledTimes(2);
  });
});
