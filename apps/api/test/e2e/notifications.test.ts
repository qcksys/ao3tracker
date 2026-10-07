import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, inject, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import {
  claimNotificationDispatches,
  getPendingNotificationDispatches,
  getUserNotifications,
  recordNotificationDispatch,
  resetWorkAvailabilityNotifications,
} from "~/db/queries/notification";
import { tNotification } from "~/db/schema/notification";
import { tTrackWork } from "~/db/schema/track.work";
import {
  createWorkNotifications,
  dispatchPendingNotifications,
  type NotificationQueueMessage,
} from "~/lib/notification-service";
import { seedSyncDatabase } from "./seed";

const db = createDbConnection(inject("databaseUrl"));
const sendBatch = vi.fn();
const queue = { sendBatch } as unknown as Queue<NotificationQueueMessage>;
const event = {
  workId: 1,
  workTitle: "Seeded work 1",
  type: "new_chapters" as const,
  oldChapters: 1,
  newChapters: 2,
};

beforeEach(async () => {
  vi.resetAllMocks();
  await seedSyncDatabase(db);
  await db.delete(tNotification);
  await db.update(tTrackWork).set({ subscribed: true }).where(eq(tTrackWork.workId, 1));
});

describe("notification event identity in MySQL", () => {
  it("creates one history record per subscriber when the same event overlaps", async () => {
    const created = await Promise.all(
      Array.from({ length: 4 }, () => createWorkNotifications(db, queue, event)),
    );
    expect(created.reduce((sum, count) => sum + count, 0)).toBe(2);
    for (const userId of ["reader", "other"]) {
      expect((await getUserNotifications(db, userId)).notifications).toHaveLength(1);
    }
    expect(sendBatch.mock.calls.flatMap(([batch]) => batch)).toHaveLength(2);
  });

  it("does not repeat an event after the one-hour window expires", async () => {
    await createWorkNotifications(db, queue, event);
    const earlier = new Date("2025-01-01T00:00:00Z");
    await db.update(tNotification).set({ rowCreatedAt: earlier, rowUpdatedAt: earlier });
    await createWorkNotifications(db, queue, event);
    expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(1);
    const rows = await db.select().from(tNotification);
    expect(rows.map(({ rowCreatedAt, rowUpdatedAt }) => ({ rowCreatedAt, rowUpdatedAt }))).toEqual(
      Array.from({ length: 2 }, () => ({ rowCreatedAt: earlier, rowUpdatedAt: earlier })),
    );
    expect(sendBatch.mock.calls.flatMap(([batch]) => batch)).toHaveLength(2);
  });

  it("keeps distinct chapter updates even when they arrive within one hour", async () => {
    await createWorkNotifications(db, queue, event);
    await createWorkNotifications(db, queue, { ...event, oldChapters: 2, newChapters: 3 });
    expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(2);
  });

  it("deduplicates the target chapter count regardless of a stale starting count or title", async () => {
    await createWorkNotifications(db, queue, event);
    await createWorkNotifications(db, queue, {
      ...event,
      oldChapters: 0,
      workTitle: "Renamed work",
    });
    expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(1);
    await createWorkNotifications(db, queue, { ...event, type: "work_completed" });
    expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(2);
  });

  it.each(["work_restricted", "work_deleted"] as const)(
    "suppresses repeated %s observations until a successful fetch ends the episode",
    async (type) => {
      const unavailable = { workId: 1, workTitle: "Unavailable work", type };
      await createWorkNotifications(db, queue, unavailable);
      await db.update(tNotification).set({ rowCreatedAt: new Date(Date.now() - 7_200_000) });
      await createWorkNotifications(db, queue, unavailable);
      expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(1);
      await resetWorkAvailabilityNotifications(db, 1);
      await createWorkNotifications(db, queue, unavailable);
      expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(2);
    },
  );

  it("retries a failed queue handoff without resetting an already dispatched event", async () => {
    sendBatch.mockRejectedValueOnce(new Error("Queue unavailable"));
    await createWorkNotifications(db, queue, event);
    expect(await getPendingNotificationDispatches(db)).toHaveLength(2);
    await createWorkNotifications(db, queue, event);
    expect(await getPendingNotificationDispatches(db)).toHaveLength(0);
    await createWorkNotifications(db, queue, event);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect((await getUserNotifications(db, "reader")).notifications).toHaveLength(1);
  });

  it("recovers expired claims and rejects acknowledgements from the previous owner", async () => {
    sendBatch.mockRejectedValueOnce(new Error("Queue unavailable"));
    await createWorkNotifications(db, queue, event);
    const ids = (await getPendingNotificationDispatches(db)).map(({ id }) => id);
    expect(await claimNotificationDispatches(db, ids, "old-claim")).toHaveLength(2);
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch).toHaveBeenCalledTimes(1);

    await db.update(tNotification).set({ dispatchClaimedAt: new Date(Date.now() - 360_000) });
    expect(await claimNotificationDispatches(db, ids, "new-claim")).toHaveLength(2);
    await recordNotificationDispatch(db, ids, "old-claim");
    const rows = await db.select().from(tNotification);
    expect(rows.every((row) => row.dispatchPending && row.dispatchClaim === "new-claim")).toBe(
      true,
    );
    await recordNotificationDispatch(db, ids, "new-claim", "Retry later");
    await dispatchPendingNotifications(db, queue);
    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(await getPendingNotificationDispatches(db)).toHaveLength(0);
  });
});
