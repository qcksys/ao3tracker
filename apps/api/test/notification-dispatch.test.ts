import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import {
  claimNotificationDispatches,
  getPendingNotificationDispatches,
  getSubscribedUsersForWork,
  recordNotificationDispatch,
  upsertNotifications,
} from "~/db/queries/notification";
import type { TNotificationS } from "~/db/schema/notification";
import {
  createWorkNotifications,
  dispatchPendingNotifications,
  type NotificationQueueMessage,
} from "~/lib/notification-service";
import { scheduled } from "~/scheduled/handler";

vi.mock("~/db/queries/notification", () => ({
  claimNotificationDispatches: vi.fn(),
  getPendingNotificationDispatches: vi.fn(),
  getSubscribedUsersForWork: vi.fn(),
  upsertNotifications: vi.fn(),
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
    eventKey: "2",
    status: "pending",
    dispatchPending: true,
    dispatchClaim: null,
    dispatchClaimedAt: null,
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
    vi.mocked(upsertNotifications).mockResolvedValue(1);
    vi.mocked(claimNotificationDispatches).mockImplementation(async (_db, ids) =>
      ids.map(notification),
    );
  });

  it("keeps failed sends durable and retries them without another work update", async () => {
    sendBatch.mockRejectedValueOnce(new Error("Queue unavailable"));
    expect(await createWorkNotifications(db, queue, event)).toBe(1);
    expect(upsertNotifications).toHaveBeenCalledWith(db, [
      expect.objectContaining({ dispatchPending: true, eventKey: "2" }),
    ]);
    expect(recordNotificationDispatch).toHaveBeenCalledWith(
      db,
      [1],
      expect.any(String),
      "Queue unavailable",
    );

    await dispatchPendingNotifications(db, queue);
    expect(getPendingNotificationDispatches).toHaveBeenLastCalledWith(db, undefined);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(recordNotificationDispatch).toHaveBeenLastCalledWith(db, [1], expect.any(String));
    expect(upsertNotifications).toHaveBeenCalledTimes(1);
  });

  it("retries pending deliveries when an event is deduplicated", async () => {
    vi.mocked(upsertNotifications).mockResolvedValue(0);
    expect(await createWorkNotifications(db, queue, event)).toBe(0);
    expect(upsertNotifications).toHaveBeenCalledOnce();
    expect(sendBatch).toHaveBeenCalledOnce();
  });

  it("retains only failed batches and continues dispatching later batches", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => notification(index + 1));
    vi.mocked(getPendingNotificationDispatches).mockResolvedValue(rows);
    sendBatch.mockRejectedValueOnce(new Error("Temporary failure"));
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 1]);
    expect(vi.mocked(recordNotificationDispatch).mock.calls).toEqual([
      [db, rows.slice(0, 100).map(({ id }) => id), expect.any(String), "Temporary failure"],
      [db, rows.slice(100, 200).map(({ id }) => id), expect.any(String)],
      [db, [201], expect.any(String)],
    ]);
  });

  it("does not queue rows when notification persistence fails", async () => {
    vi.mocked(upsertNotifications).mockRejectedValue(new Error("Database unavailable"));
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
    expect(upsertNotifications).not.toHaveBeenCalled();
  });

  it("leaves records retryable if acknowledging the queue handoff fails", async () => {
    vi.mocked(recordNotificationDispatch).mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(dispatchPendingNotifications(db, queue)).rejects.toThrow("Database unavailable");
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch records claimed by another invocation", async () => {
    vi.mocked(claimNotificationDispatches).mockResolvedValue([]);
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch).not.toHaveBeenCalled();
    expect(recordNotificationDispatch).not.toHaveBeenCalled();
  });
});
