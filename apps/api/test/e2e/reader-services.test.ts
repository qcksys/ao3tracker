import { randomInt, randomUUID } from "node:crypto";
import { getFullSync, postSync } from "@qcksys/ao3tracker-sync-client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tNotification } from "~/db/schema/notification";
import { tPushToken } from "~/db/schema/push.token";
import { tTrackWork } from "~/db/schema/track.work";
import { tWork } from "~/db/schema/work";
import { tWorkBackup } from "~/db/schema/work.backup";

const db = createDbConnection(inject("databaseUrl"));
const baseUrl = inject("apiUrl");
const userId = randomUUID();
const token = randomUUID();
const workId = randomInt(1_000_000_000_000, 2_000_000_000_000);
const revision = 1_700_000_000;
const updatedAt = new Date(revision * 1000);
const client = { baseUrl, getBearerToken: () => token };
let seeded = false;

function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  return fetch(baseUrl + path, { ...init, headers });
}

beforeAll(async () => {
  await db.transaction(async (tx) => {
    await tx
      .insert(tAuthUser)
      .values({ id: userId, name: "Reader", email: `${userId}@example.test`, emailVerified: true });
    await tx
      .insert(tAuthSession)
      .values({ id: randomUUID(), userId, token, expiresAt: new Date(Date.now() + 3_600_000) });
    await tx.insert(tWork).values({
      id: workId,
      title: "Backup test",
      author: "Test",
      language: "English",
      wordCount: 1,
      currentChapters: 1,
      published: updatedAt,
      lastUpdated: updatedAt,
      downloadUpdatedAt: updatedAt,
    });
  });
  seeded = true;
});

afterAll(async () => {
  try {
    if (seeded)
      await db.transaction(async (tx) => {
        await tx.delete(tWorkBackup).where(eq(tWorkBackup.workId, workId));
        await tx.delete(tNotification).where(eq(tNotification.userId, userId));
        await tx.delete(tPushToken).where(eq(tPushToken.userId, userId));
        await tx.delete(tTrackWork).where(eq(tTrackWork.userId, userId));
        await tx.delete(tAuthSession).where(eq(tAuthSession.userId, userId));
        await tx.delete(tAuthUser).where(eq(tAuthUser.id, userId));
        await tx.delete(tWork).where(eq(tWork.id, workId));
      });
  } finally {
    await db.$client.end();
  }
});

it("syncs a tracked work, stores its backup once and serves the original file and offline chapter", async () => {
  const path = `/api/backup/${workId}`;
  expect((await request(path)).status).toBe(403);
  const sync = await postSync(client, {
    works: [
      {
        workId,
        lastReadAt: updatedAt.toISOString(),
        markedCompleteAt: null,
        private: false,
        subscribed: true,
        favourite: false,
        subscribedUpdatedAt: null,
        favouriteUpdatedAt: null,
      },
    ],
    chapters: [],
  });
  expect(sync.works[0].status).toBe("accepted");
  expect((await getFullSync(client)).workMetadata).toContainEqual(
    expect.objectContaining({ id: workId, title: "Backup test" }),
  );
  const html =
    '<html><body><div id="chapters"><div class="userstuff"><p>Postgres reader fixture.</p></div></div></body></html>';
  function upload(timestamp: number) {
    return request(`/checker/backups/${workId}/html?downloadUpdatedAt=${timestamp}`, {
      method: "PUT",
      headers: { authorization: "Bearer e2e-checker" },
      body: html,
    });
  }
  expect((await upload(revision - 1)).status).toBe(409);
  expect(await (await upload(revision)).json()).toEqual({ outcome: "stored" });
  expect(await (await upload(revision)).json()).toEqual({ outcome: "current" });
  const backups = await (await request(path)).json();
  expect(backups).toEqual([
    expect.objectContaining({
      workId,
      fileSize: Buffer.byteLength(html),
      ao3UpdatedAt: updatedAt.toISOString(),
    }),
  ]);
  expect(await (await request(backups[0].downloadPath)).text()).toBe(html);
  const offline = await (await request(`${path}/offline`)).json();
  expect(offline.chapters).toEqual([
    expect.objectContaining({ id: "0", html: expect.stringContaining("Postgres reader fixture.") }),
  ]);
});

it("persists device preferences, returns notification history and retires the device", async () => {
  const deviceId = "reader-device";
  async function register(value: string, enabled: boolean) {
    const response = await request("/api/push/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        token: value,
        platform: "ios",
        notificationPreferences: { enabled },
      }),
    });
    expect(response.status).toBe(200);
  }
  await register("initial", true);
  await register("refreshed", false);
  const devices = () => db.select().from(tPushToken).where(eq(tPushToken.userId, userId));
  expect(await devices()).toEqual([
    expect.objectContaining({
      token: "refreshed",
      notificationPreferences: expect.objectContaining({ enabled: false }),
    }),
  ]);
  await db.insert(tNotification).values({
    userId,
    workId,
    type: "new_chapters",
    title: "New chapter",
    body: "Test history",
    status: "sent",
    sentAt: updatedAt,
  });
  expect(await (await request("/api/push/notifications")).json()).toMatchObject({
    notifications: [{ workId, type: "new_chapters", sentAt: updatedAt.toISOString() }],
    hasMore: false,
  });
  expect((await request(`/api/push/token/${deviceId}`, { method: "DELETE" })).status).toBe(200);
  expect((await devices())[0].rowDeletedAt).toBeInstanceOf(Date);
});
