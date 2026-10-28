import { subDays, subHours, subMinutes } from "date-fns";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { getAdminStats } from "~/db/queries/admin-stats";
import { listWorkCheckerStatuses, upsertWorkCheckerStatus } from "~/db/queries/work-checker-status";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tNotification } from "~/db/schema/notification";
import { tPushToken } from "~/db/schema/push.token";
import { tTrackChapter } from "~/db/schema/track.chapter";
import { tTrackWork } from "~/db/schema/track.work";
import { tWork } from "~/db/schema/work";
import { tWorkBackup } from "~/db/schema/work.backup";
import { tWorkCheckerStatus } from "~/db/schema/work.checker.status";

const db = createDbConnection(inject("databaseUrl"));
// Whole seconds: the audited datetime columns have no fractional part.
const now = new Date(Math.floor(Date.now() / 1000) * 1000);

function work(id: number, overrides: Partial<typeof tWork.$inferInsert> = {}) {
  return {
    id,
    title: `Work ${id}`,
    author: "Author",
    language: "English",
    wordCount: 1000,
    currentChapters: 1,
    published: now,
    lastUpdated: now,
    lastRefreshed: now,
    ...overrides,
  };
}

beforeEach(async () => {
  for (const table of [
    tAuthSession,
    tTrackChapter,
    tTrackWork,
    tNotification,
    tPushToken,
    tWorkBackup,
    tWork,
    tAuthUser,
    tWorkCheckerStatus,
  ]) {
    await db.delete(table);
  }
});

describe("admin dashboard stats in MySQL", () => {
  it("counts each figure from its own rows", async () => {
    await db.insert(tAuthUser).values([
      {
        id: "admin",
        name: "admin",
        email: "admin@example.test",
        role: "admin",
        createdAt: subDays(now, 30),
      },
      { id: "new", name: "new", email: "new@example.test", createdAt: now },
    ]);
    await db.insert(tWork).values([
      work(1),
      work(2, { lastRefreshed: subHours(now, 10) }),
      // A recent failure moves lastRefreshed near now; it is not a refresh.
      work(3, { refreshFailures: 2, lastRefreshed: subMinutes(now, 1) }),
      work(4, { rowDeletedAt: now }),
    ]);
    await db.insert(tTrackWork).values([
      { userId: "admin", workId: 1, lastReadAt: now },
      { userId: "new", workId: 1, lastReadAt: now },
      { userId: "new", workId: 2, lastReadAt: now },
    ]);
    await db.insert(tNotification).values([
      {
        userId: "new",
        workId: 1,
        type: "new_chapters",
        title: "t",
        body: "b",
        dispatchPending: true,
      },
      { userId: "new", workId: 2, type: "new_chapters", title: "t", body: "b", status: "failed" },
    ]);
    await db.insert(tPushToken).values({
      userId: "new",
      deviceId: "device",
      token: "token",
      lastValidatedAt: now,
    });
    await db.insert(tWorkBackup).values([
      { r2Key: "1/1.epub", workId: 1, format: "epub", fileSize: 100 },
      { r2Key: "1/1.html", workId: 1, format: "html", fileSize: 200 },
    ]);

    const stats = await getAdminStats(db, {
      staleBefore: subHours(now, 6),
      usersSince: subDays(now, 7),
      refreshedSince: subHours(now, 1),
      notificationsSince: subHours(now, 24),
    });

    expect(stats).toMatchObject({
      users: { total: 2, recent: 1, admins: 1 },
      tracking: { trackedWorks: 2, trackingRows: 3 },
      works: {
        stored: 3,
        deleted: 1,
        stale: 1,
        failing: 1,
        refreshedRecently: 1,
        lastRefreshedAt: now,
      },
      notifications: { pendingDispatch: 1, createdRecently: 2, failed: 1 },
      devices: { pushTokens: 1 },
      backups: { count: 2, totalBytes: 300 },
    });
  });

  it("reports zeros for an empty database", async () => {
    const stats = await getAdminStats(db, {
      staleBefore: now,
      usersSince: now,
      refreshedSince: now,
      notificationsSince: now,
    });

    expect(stats.backups).toEqual({ count: 0, totalBytes: 0, lastBackupAt: null });
    expect(stats.works.lastRefreshedAt).toBeNull();
  });
});

describe("work checker status in MySQL", () => {
  it("keeps only each checker's latest report", async () => {
    const status = {
      checkerId: "hub-dev",
      version: "aaaaaaa",
      startedAt: now.toISOString(),
      lastPoll: null,
      lastError: null,
    };
    await upsertWorkCheckerStatus(db, {
      checkerId: "hub-dev",
      status,
      reportedAt: subMinutes(now, 5),
    });
    await upsertWorkCheckerStatus(db, {
      checkerId: "hub-dev",
      status: { ...status, version: "bbbbbbb" },
      reportedAt: now,
    });
    await upsertWorkCheckerStatus(db, {
      checkerId: "hub-prod",
      status: { ...status, checkerId: "hub-prod" },
      reportedAt: now,
    });

    const statuses = await listWorkCheckerStatuses(db);

    expect(
      statuses.map(({ checkerId, status: { version }, reportedAt }) => ({
        checkerId,
        version,
        reportedAt,
      })),
    ).toEqual([
      { checkerId: "hub-dev", version: "bbbbbbb", reportedAt: now },
      { checkerId: "hub-prod", version: "aaaaaaa", reportedAt: now },
    ]);
  });
});
