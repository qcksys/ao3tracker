import type { PostSyncRequest } from "@qcksys/ao3tracker-core/schemas";
import {
  getFullSync,
  getSync,
  postSync,
  type SyncClientConfig,
} from "@qcksys/ao3tracker-sync-client";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { upsertWorkTags } from "~/db/queries/work";
import { tTrackChapter } from "~/db/schema/track.chapter";
import { tTrackWork } from "~/db/schema/track.work";
import { tWork } from "~/db/schema/work";
import { tWorkChapter } from "~/db/schema/work.chapter";
import {
  deletedSearchId,
  editedAt,
  newestAt,
  searchId,
  searchUrl,
  seededAt,
  seedSyncDatabase,
  sessionToken,
} from "./seed";

const db = createDbConnection(inject("databaseUrl"));
const apiUrl = inject("apiUrl");
function client(userId = "reader"): SyncClientConfig {
  return {
    baseUrl: apiUrl,
    getBearerToken: () => sessionToken(userId),
  };
}
const reader = client();
const other = client("other");
const work = (workId: number, lastReadAt = editedAt) => ({
  workId,
  lastReadAt,
  markedCompleteAt: null,
  private: false,
  subscribed: true,
  favourite: false,
  subscribedUpdatedAt: null,
  favouriteUpdatedAt: null,
});
const chapter = (lastReadAt = editedAt) => ({
  workId: 1,
  chapterId: 11,
  lastReadAt,
  readProgress: 0,
  markedCompleteAt: null,
});
const favouriteTag = (updatedAt = editedAt) => ({
  tagType: 7 as const,
  tag: "Fluff",
  favourited: false,
  updatedAt,
});
const savedSearch = (updatedAt = editedAt) => ({
  id: searchId,
  name: "Offline edit",
  url: searchUrl,
  deleted: true,
  updatedAt,
});

beforeEach(async () => {
  await seedSyncDatabase(db);
});

describe("seeded sync through the Worker and MySQL", () => {
  it("paginates a full library with metadata, private works and tombstones", async () => {
    const first = await getSync(reader, { limit: 2 });
    expect(first.works.map((row) => row.workId)).toEqual([1, 2]);
    expect(first).toMatchObject({ hasMore: true, nextWorkCursor: 2 });
    expect(first.workMetadata.map((row) => row.id)).toEqual([1]);
    expect(first.chapterMetadata.map((row) => row.id).sort((left, right) => left - right)).toEqual([
      11, 12,
    ]);
    expect(first.tagMetadata).toEqual([
      { workId: 1, tag: "Fluff", href: "/tags/Fluff/works", type: "freeform" },
    ]);
    const last = await getSync(reader, { limit: 2, workCursor: 2 });
    expect(last.works.map((row) => row.workId)).toEqual([3, 4]);
    expect(last).toMatchObject({ hasMore: false, nextWorkCursor: null });
    expect(last.favouriteTags).toBeUndefined();
    expect(last.savedSearches).toBeUndefined();

    const full = await getFullSync(reader, { limit: 1 });
    expect(full.works.map((row) => row.workId)).toEqual([1, 2, 3, 4]);
    expect(full.works.find((row) => row.workId === 3)?.deleted).toBe(true);
    expect(full.chapters).toHaveLength(4);
    expect(full.chapters.find((row) => row.chapterId === 12)?.deleted).toBe(true);
    expect(full.workMetadata.map((row) => row.id)).toEqual([1, 4]);
    expect(full.favouriteTags).toHaveLength(2);
    expect(full.favouriteTags).toContainEqual({
      tagType: 7,
      tag: "Angst",
      favourited: false,
      updatedAt: seededAt.toISOString(),
    });
    expect(full.savedSearches).toHaveLength(2);
    expect(full.savedSearches).toContainEqual(
      expect.objectContaining({ id: deletedSearchId, deleted: true }),
    );

    const filtered = await getFullSync(reader, { filter: { type: "workIds", workIds: [1, 99] } });
    expect(filtered.works.map((row) => row.workId)).toEqual([1]);
    expect(filtered.chapters.every((row) => row.workId === 1)).toBe(true);
  });

  it("persists an offline upload and makes it available to another device and incremental pulls", async () => {
    const initial = await getFullSync(reader);
    const cursor = { lastSyncedAt: initial.serverLastUpdated };
    expect((await getSync(reader, cursor)).works).toEqual([]);
    const beforeOther = await getFullSync(other);
    const upload: PostSyncRequest = {
      works: [work(1), work(5)],
      chapters: [
        chapter(),
        {
          workId: 5,
          chapterId: 0,
          lastReadAt: editedAt,
          readProgress: 0.6,
          markedCompleteAt: null,
        },
      ],
      favouriteTags: [favouriteTag()],
      savedSearches: [savedSearch()],
    };
    const result = await postSync(reader, upload);
    expect(result.works).toEqual([
      { workId: 1, status: "accepted" },
      { workId: 5, status: "accepted" },
    ]);
    expect(result.chapters.every((row) => row.status === "accepted")).toBe(true);
    expect(result.favouriteTags).toEqual([{ tagType: 7, tag: "Fluff", status: "accepted" }]);
    expect(result.savedSearches).toEqual([{ id: searchId, status: "accepted" }]);
    const delta = await getFullSync(client(), { ...cursor, limit: 1 });
    expect(delta.works.map((row) => row.workId)).toEqual([1, 5]);
    expect(delta.chapters).toContainEqual(
      expect.objectContaining({
        chapterId: 11,
        readProgress: 0,
        markedCompleteAt: null,
        lastReadAt: editedAt,
      }),
    );
    expect(delta.favouriteTags).toEqual([favouriteTag()]);
    expect(delta.savedSearches).toEqual([savedSearch()]);
    expect(Date.parse(editedAt)).toBeLessThan(Date.parse(cursor.lastSyncedAt));

    const persisted = await db
      .select()
      .from(tTrackChapter)
      .where(and(eq(tTrackChapter.userId, "reader"), eq(tTrackChapter.chapterId, 11)));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      readProgress: 0,
      markedCompleteAt: null,
      lastReadAt: new Date(editedAt),
      rowCreatedAt: seededAt,
    });
    const afterOther = await getFullSync(other);
    expect({ ...afterOther, serverLastUpdated: beforeOther.serverLastUpdated }).toEqual(
      beforeOther,
    );

    await postSync(reader, upload);
    const replay = await getFullSync(client(), { ...cursor, limit: 1 });
    expect({ ...replay, serverLastUpdated: delta.serverLastUpdated }).toEqual(delta);
    expect(await db.select().from(tTrackWork).where(eq(tTrackWork.userId, "reader"))).toHaveLength(
      5,
    );
  });

  it("merges preference clocks independently and rejects stale or equal reading resets", async () => {
    await postSync(reader, {
      works: [
        {
          ...work(1),
          favourite: true,
          favouriteUpdatedAt: newestAt,
          subscribed: false,
          subscribedUpdatedAt: newestAt,
        },
      ],
      chapters: [{ ...chapter(), readProgress: 1, markedCompleteAt: editedAt }],
    });
    await postSync(client(), { works: [work(1, newestAt)], chapters: [chapter(newestAt)] });
    for (const lastReadAt of [editedAt, newestAt]) {
      const response = await postSync(reader, {
        works: [{ ...work(1, lastReadAt), private: true, markedCompleteAt: lastReadAt }],
        chapters: [{ ...chapter(lastReadAt), readProgress: 1, markedCompleteAt: lastReadAt }],
      });
      expect(response.works).toEqual([{ workId: 1, status: "ignored" }]);
      expect(response.chapters).toEqual([{ workId: 1, chapterId: 11, status: "ignored" }]);
    }
    const pulled = await getFullSync(client());
    expect(pulled.works.find((row) => row.workId === 1)).toMatchObject({
      lastReadAt: newestAt,
      private: false,
      markedCompleteAt: null,
      favourite: true,
      favouriteUpdatedAt: newestAt,
      subscribed: false,
      subscribedUpdatedAt: newestAt,
    });
    expect(pulled.chapters.find((row) => row.chapterId === 11)).toMatchObject({
      readProgress: 0,
      markedCompleteAt: null,
      lastReadAt: newestAt,
    });
  });

  it("propagates deletions and rejects stale resurrection for every synced entity", async () => {
    const { serverLastUpdated: lastSyncedAt } = await getSync(reader);
    await postSync(reader, {
      works: [
        { ...work(1, newestAt), deleted: true },
        { ...work(6, newestAt), deleted: true },
      ],
      chapters: [{ ...chapter(newestAt), deleted: true }],
      favouriteTags: [favouriteTag(newestAt)],
      savedSearches: [savedSearch(newestAt)],
    });
    for (const timestamp of [editedAt, newestAt]) {
      const stale = await postSync(client(), {
        works: [work(1, timestamp)],
        chapters: [chapter(timestamp)],
        favouriteTags: [{ ...favouriteTag(timestamp), favourited: true }],
        savedSearches: [{ ...savedSearch(timestamp), deleted: false }],
      });
      expect(stale.works[0].status).toBe("ignored");
      expect(stale.chapters[0].status).toBe("ignored");
      expect(stale.favouriteTags?.[0].status).toBe("ignored");
      expect(stale.savedSearches?.[0].status).toBe("ignored");
    }
    const delta = await getFullSync(client(), { lastSyncedAt, limit: 1 });
    expect(delta.works.map((row) => [row.workId, row.deleted])).toEqual([
      [1, true],
      [6, true],
    ]);
    expect(delta.chapters.find((row) => row.chapterId === 11)?.deleted).toBe(true);
    expect(delta.workMetadata).toEqual([]);
    expect(delta.favouriteTags).toEqual([favouriteTag(newestAt)]);
    expect(delta.savedSearches).toEqual([savedSearch(newestAt)]);
  });

  it("discovers a chapter-only reset without changing the work reading timestamp", async () => {
    const { serverLastUpdated: lastSyncedAt } = await getSync(reader);
    await postSync(reader, { works: [work(1, seededAt.toISOString())], chapters: [chapter()] });
    const delta = await getFullSync(reader, { lastSyncedAt });
    expect(delta.works.map((row) => row.workId)).toEqual([1]);
    expect(delta.works[0].lastReadAt).toBe(seededAt.toISOString());
    expect(delta.chapters.find((row) => row.chapterId === 11)?.readProgress).toBe(0);
  });

  it("discovers work metadata changes without a tracking mutation", async () => {
    const { serverLastUpdated: lastSyncedAt } = await getSync(reader);
    await db.update(tWork).set({ title: "Refreshed title" }).where(eq(tWork.id, 4));
    const delta = await getFullSync(reader, { lastSyncedAt });
    expect(delta.works.map((row) => row.workId)).toEqual([4]);
    expect(delta.works[0].lastReadAt).toBe(seededAt.toISOString());
    expect(delta.workMetadata.find((row) => row.id === 4)?.title).toBe("Refreshed title");
  });

  it("discovers chapter metadata changes without a work or tracking mutation", async () => {
    const { serverLastUpdated: lastSyncedAt } = await getSync(reader);
    await db.update(tWorkChapter).set({ title: "Renamed chapter" }).where(eq(tWorkChapter.id, 41));
    const delta = await getFullSync(reader, { lastSyncedAt });
    expect(delta.works.map((row) => row.workId)).toEqual([4]);
    expect(delta.chapterMetadata.find((row) => row.id === 41)?.title).toBe("Renamed chapter");
  });

  it("discovers replacement of a work's tags with an empty set", async () => {
    const { serverLastUpdated: lastSyncedAt } = await getSync(reader);
    await upsertWorkTags(db, 1, []);
    const delta = await getFullSync(reader, { lastSyncedAt });
    expect(delta.works.map((row) => row.workId)).toEqual([1]);
    expect(delta.tagMetadata).toEqual([]);
  });

  it("includes rows exactly on an incremental boundary and resets future cursors", async () => {
    const inclusive = await getFullSync(reader, { lastSyncedAt: seededAt.toISOString() });
    expect(inclusive.works).toHaveLength(4);
    expect(inclusive.favouriteTags).toHaveLength(2);
    expect(inclusive.savedSearches).toHaveLength(2);
    const after = await getSync(reader, { lastSyncedAt: editedAt });
    expect(after.works).toEqual([]);
    expect(after.favouriteTags).toEqual([]);
    expect(after.savedSearches).toEqual([]);
    const future = await getFullSync(reader, { lastSyncedAt: "2100-01-01T00:00:00.000Z" });
    expect(future.works).toEqual(inclusive.works);
    expect(future.favouriteTags).toEqual(inclusive.favouriteTags);
    expect(future.savedSearches).toEqual(inclusive.savedSearches);
  });

  it("maps legacy single-chapter uploads to the canonical chapter without resurrecting chapter zero", async () => {
    await postSync(reader, {
      works: [work(1)],
      chapters: [{ ...chapter(), chapterId: 0, readProgress: 0.5 }],
    });
    let full = await getFullSync(client());
    expect(full.chapters.find((row) => row.workId === 1 && row.chapterId === 0)).toMatchObject({
      deleted: true,
      lastReadAt: editedAt,
    });
    expect(full.chapters.find((row) => row.chapterId === 11)).toMatchObject({
      deleted: false,
      readProgress: 0.5,
      lastReadAt: editedAt,
    });
    await postSync(reader, {
      works: [work(1)],
      chapters: [{ ...chapter(), chapterId: 0, deleted: true }],
    });
    full = await getFullSync(client());
    expect(full.chapters.find((row) => row.chapterId === 11)?.deleted).toBe(false);
    await postSync(reader, {
      works: [work(1, newestAt)],
      chapters: [{ ...chapter(newestAt), chapterId: 0, deleted: true }],
    });
    full = await getFullSync(client());
    expect(full.chapters.find((row) => row.chapterId === 11)).toMatchObject({
      deleted: true,
      lastReadAt: newestAt,
    });
  });

  it("rejects unauthenticated and invalid uploads without modifying seeded state", async () => {
    const before = await getFullSync(reader);
    for (const method of ["GET", "POST"]) {
      for (const token of [null, "invalid-session"]) {
        const response = await fetch(`${apiUrl}/api/track/sync`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(method === "POST" ? { body: JSON.stringify({ works: [work(1)] }) } : {}),
        });
        expect(response.status).toBe(401);
        await response.text();
      }
    }
    for (const body of [
      { chapters: [chapter()] },
      { works: [work(1)], chapters: [{ ...chapter(), readProgress: 1.5 }] },
      { works: Array.from({ length: 51 }, (_, i) => work(i + 1)) },
    ]) {
      const response = await fetch(`${apiUrl}/api/track/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken("reader")}`,
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      await response.text();
    }
    const after = await getFullSync(reader);
    expect({ ...after, serverLastUpdated: before.serverLastUpdated }).toEqual(before);
  });
});
