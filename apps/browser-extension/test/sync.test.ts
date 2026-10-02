import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const persisted = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (key: string, options: { fallback: unknown }) => ({
      key,
      getValue: async () =>
        structuredClone(persisted.has(key) ? persisted.get(key) : options.fallback),
      setValue: async (value: unknown) => {
        persisted.set(key, structuredClone(value));
      },
    }),
    setItems: async (items: { item: { key: string }; value: unknown }[]) => {
      for (const { item, value } of items) persisted.set(item.key, structuredClone(value));
    },
  },
}));

import {
  accountArchivesItem,
  accountContextItem,
  captureSyncSession,
  setApiEndpoint,
  setAuthSession,
} from "../lib/account-state";
import { toggleFavouriteTag } from "../lib/favourite-tags-repo";
import { withLocalState } from "../lib/local-state";
import { renameSavedSearch, saveSearch } from "../lib/saved-searches-repo";
import {
  authTokenItem,
  favouriteTagsItem,
  lastSyncedAtItem,
  savedSearchesItem,
  tagMetadataItem,
  trackedChaptersItem,
  trackedWorksItem,
  type TrackedWork,
} from "../lib/storage";
import { runSync, StaleSyncSessionError } from "../lib/sync";
import { ingestPageEvent, setFavourite, setSubscribed } from "../lib/tracker-repo";

const baseUrl = "https://ao3tracker.com";
const time = "2025-01-01T00:00:00.000Z";
const serverCursor = "2030-01-01T00:00:00.000Z";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: unknown): Response {
  return Response.json(body);
}

function parsePosted(body: RequestInit["body"]) {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(body);
}

function remote(extra: Record<string, unknown> = {}) {
  return {
    works: [],
    chapters: [],
    workMetadata: [],
    chapterMetadata: [],
    tagMetadata: [],
    favouriteTags: [],
    savedSearches: [],
    hasMore: false,
    nextWorkCursor: null,
    serverLastUpdated: serverCursor,
    latestWorkLastReadAt: null,
    ...extra,
  };
}

function work(workId: number): TrackedWork {
  return {
    workId,
    lastReadAt: time,
    markedCompleteAt: null,
    private: false,
    subscribed: true,
    favourite: false,
    subscribedUpdatedAt: null,
    favouriteUpdatedAt: null,
    deleted: false,
    pendingSync: true,
  };
}

function postResponse() {
  return response({
    works: [],
    chapters: [],
    favouriteTags: [],
    savedSearches: [],
    syncedAt: serverCursor,
  });
}

function installFetch(
  sync: typeof fetch = async (_input, init) =>
    init?.method === "POST" ? postResponse() : response(remote()),
) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/auth/get-session")) {
      const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "");
      return response({ user: { id: token } });
    }
    return sync(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  await withLocalState(async () => undefined);
  persisted.clear();
  installFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe("account ownership", () => {
  it("archives unsynced data and restores only the matching account and endpoint", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: work(1) });
    await lastSyncedAtItem.setValue(time);
    const saved = await saveSearch("Alice search", "https://archiveofourown.org/works?x=1");
    await setAuthSession(null, baseUrl);
    expect(await trackedWorksItem.getValue()).toEqual({});
    await setAuthSession("bob", baseUrl);
    expect(await trackedWorksItem.getValue()).toEqual({});
    expect(await savedSearchesItem.getValue()).toEqual([]);
    expect(await lastSyncedAtItem.getValue()).toBeNull();
    await setAuthSession("alice", baseUrl);
    expect((await trackedWorksItem.getValue())[1]?.pendingSync).toBe(true);
    expect((await savedSearchesItem.getValue())[0]?.id).toBe(saved.id);
    expect(await lastSyncedAtItem.getValue()).toBe(time);
    await setApiEndpoint("https://dev.ao3tracker.com");
    expect(await authTokenItem.getValue()).toBeNull();
    await setAuthSession("alice", "https://dev.ao3tracker.com");
    expect(await trackedWorksItem.getValue()).toEqual({});
    expect(Object.keys(await accountArchivesItem.getValue())).toContain(
      JSON.stringify([baseUrl, "alice"]),
    );
  });

  it("assigns legacy data only after verifying the existing token", async () => {
    await authTokenItem.setValue("alice");
    await trackedWorksItem.setValue({ 1: work(1) });
    await lastSyncedAtItem.setValue(time);
    expect((await captureSyncSession())?.userId).toBe("alice");
    expect((await trackedWorksItem.getValue())[1]?.pendingSync).toBe(true);
    expect(await lastSyncedAtItem.getValue()).toBeNull();
    await lastSyncedAtItem.setValue(time);
    await captureSyncSession();
    expect(await lastSyncedAtItem.getValue()).toBe(time);
  });

  it("retains unidentified legacy history separately when another user signs in", async () => {
    await authTokenItem.setValue("expired-alice");
    await trackedWorksItem.setValue({ 1: work(1) });
    await setAuthSession("bob", baseUrl);
    expect(await trackedWorksItem.getValue()).toEqual({});
    expect((await accountArchivesItem.getValue())[`legacy:${baseUrl}`]?.works[1]).toEqual(work(1));
  });

  it("ignores a sign-in verification that completes after sign-out", async () => {
    await setAuthSession("alice", baseUrl);
    const verification = deferred<Response>();
    const requested = deferred<void>();
    vi.stubGlobal("fetch", async () => {
      requested.resolve();
      return verification.promise;
    });
    const signingIn = setAuthSession("bob", baseUrl);
    const rejected = expect(signingIn).rejects.toThrow("changed during sign-in");
    await requested.promise;
    await setAuthSession(null, baseUrl);
    verification.resolve(response({ user: { id: "bob" } }));
    await rejected;
    expect(await authTokenItem.getValue()).toBeNull();
    expect((await accountContextItem.getValue())?.userId).toBeNull();
  });

  it("shares verification of the same legacy token between concurrent callers", async () => {
    await authTokenItem.setValue("alice");
    const fetchMock = installFetch();
    const sessions = await Promise.all([captureSyncSession(), captureSyncSession()]);
    expect(sessions.map((session) => session?.userId)).toEqual(["alice", "alice"]);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});

describe("sync concurrency", () => {
  it.each(["workInfo", "scrollProgress"] as const)(
    "restores a deleted work and uploads its chapter when reading resumes with %s",
    async (type) => {
      await setAuthSession("alice", baseUrl);
      const deletedAt = "2099-01-01T00:00:00.000Z";
      const deletedWork = { ...work(1), deleted: true, lastReadAt: deletedAt, pendingSync: false };
      const deletedChapter = {
        workId: 1,
        chapterId: 11,
        lastReadAt: deletedAt,
        markedCompleteAt: null,
        readProgress: 0.2,
        deleted: true,
        pendingSync: false,
      };
      await trackedWorksItem.setValue({ 1: deletedWork });
      await trackedChaptersItem.setValue({ "1:11": deletedChapter });
      const fetchMock = installFetch(async (_input, init) =>
        init?.method === "POST"
          ? postResponse()
          : response(remote({ works: [deletedWork], chapters: [deletedChapter] })),
      );
      await ingestPageEvent(
        type === "workInfo"
          ? {
              type,
              url: "https://archiveofourown.org/works/1",
              chapterId: "11",
              isPrivate: false,
              workName: null,
              workLastUpdated: null,
              chapterName: null,
              chapterNumber: null,
              totalChapters: null,
              authorUrl: null,
              authorName: null,
              summary: null,
              wordCount: null,
              language: null,
              kudos: null,
              hits: null,
              bookmarks: null,
              comments: null,
              downloadPath: null,
              downloadUpdatedAt: null,
            }
          : {
              type,
              url: "https://archiveofourown.org/works/1",
              chapterId: "11",
              scrollPercentage: 80,
            },
      );
      expect((await trackedWorksItem.getValue())[1]).toMatchObject({
        deleted: false,
        pendingSync: true,
      });
      await runSync();
      const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
      expect(parsePosted(posted)).toMatchObject({
        works: [expect.objectContaining({ workId: 1, deleted: false })],
        chapters: [
          expect.objectContaining({
            workId: 1,
            chapterId: 11,
            deleted: false,
            readProgress: type === "workInfo" ? 0.2 : 0.8,
          }),
        ],
      });
      expect(Date.parse(parsePosted(posted).works[0].lastReadAt)).toBeGreaterThan(
        Date.parse(deletedAt),
      );
      expect(Date.parse(parsePosted(posted).chapters[0].lastReadAt)).toBeGreaterThan(
        Date.parse(deletedAt),
      );
      expect((await trackedWorksItem.getValue())[1]?.pendingSync).toBe(false);
    },
  );

  it("preserves a work deletion when only favourite or subscription flags change", async () => {
    await trackedWorksItem.setValue({ 1: { ...work(1), deleted: true, pendingSync: false } });
    await setFavourite(1, true);
    await setSubscribed(1, false);
    expect((await trackedWorksItem.getValue())[1]).toMatchObject({
      deleted: true,
      lastReadAt: time,
      favourite: true,
      subscribed: false,
      pendingSync: true,
    });
  });

  it("merges newer remote flags even when local reading progress is newer", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: { ...work(1), lastReadAt: "2026-01-02T00:00:00.000Z" } });
    const serverWork = {
      ...work(1),
      favourite: true,
      favouriteUpdatedAt: "2026-01-03T00:00:00.000Z",
      subscribed: false,
      subscribedUpdatedAt: "2026-01-03T00:00:00.000Z",
    };
    const fetchMock = installFetch(async (_input, init) =>
      init?.method === "POST" ? postResponse() : response(remote({ works: [serverWork] })),
    );
    await runSync();
    expect((await trackedWorksItem.getValue())[1]).toMatchObject({
      lastReadAt: "2026-01-02T00:00:00.000Z",
      favourite: true,
      subscribed: false,
    });
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(parsePosted(posted).works[0]).toMatchObject({
      lastReadAt: "2026-01-02T00:00:00.000Z",
      favourite: true,
      subscribed: false,
    });
  });

  it("pushes newer pending local flags after merging newer remote reading progress", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({
      1: {
        ...work(1),
        favourite: true,
        favouriteUpdatedAt: "2026-01-03T00:00:00.000Z",
        subscribed: false,
        subscribedUpdatedAt: "2026-01-03T00:00:00.000Z",
      },
    });
    const fetchMock = installFetch(async (_input, init) =>
      init?.method === "POST"
        ? postResponse()
        : response(remote({ works: [{ ...work(1), lastReadAt: "2026-01-02T00:00:00.000Z" }] })),
    );
    await runSync();
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(parsePosted(posted).works[0]).toMatchObject({
      lastReadAt: "2026-01-02T00:00:00.000Z",
      favourite: true,
      subscribed: false,
      favouriteUpdatedAt: "2026-01-03T00:00:00.000Z",
    });
    expect((await trackedWorksItem.getValue())[1]?.pendingSync).toBe(false);
  });

  it("applies full-sync tombstones without resurrecting the local work", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: work(1) });
    installFetch(async () =>
      response(
        remote({ works: [{ ...work(1), deleted: true, lastReadAt: "2026-01-02T00:00:00.000Z" }] }),
      ),
    );
    await runSync();
    expect((await trackedWorksItem.getValue())[1]).toMatchObject({
      deleted: true,
      pendingSync: false,
    });
  });

  it.each([-1, 0, 1])(
    "reconciles a retired chapter identity with a local reading clock offset of %i ms",
    async (offset) => {
      await setAuthSession("alice", baseUrl);
      const retiredAt = "2026-01-01T00:00:00.000Z";
      const localReadAt = new Date(Date.parse(retiredAt) + offset).toISOString();
      const canonicalChapter = {
        workId: 1,
        chapterId: 11,
        lastReadAt: retiredAt,
        markedCompleteAt: null,
        readProgress: 0.2,
        deleted: false,
      };
      await trackedWorksItem.setValue({ 1: { ...work(1), pendingSync: false } });
      await trackedChaptersItem.setValue({
        "1:0": {
          ...canonicalChapter,
          chapterId: 0,
          lastReadAt: localReadAt,
          readProgress: 0.8,
          pendingSync: true,
        },
      });
      const fetchMock = installFetch(async (_input, init) =>
        init?.method === "POST"
          ? postResponse()
          : response(
              remote({
                chapters: [{ ...canonicalChapter, chapterId: 0, deleted: true }, canonicalChapter],
              }),
            ),
      );
      await runSync();
      expect((await trackedChaptersItem.getValue())["1:11"]).toMatchObject(canonicalChapter);
      const uploads = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      if (offset > 0) {
        expect(uploads).toHaveLength(1);
        expect(parsePosted(uploads[0]?.[1]?.body).chapters).toEqual([
          expect.objectContaining({
            workId: 1,
            chapterId: 0,
            lastReadAt: localReadAt,
            readProgress: 0.8,
            deleted: false,
          }),
        ]);
      } else {
        expect((await trackedChaptersItem.getValue())["1:0"]).toBeUndefined();
        expect(uploads).toHaveLength(0);
      }
    },
  );

  it("uploads pending chapter tombstones with their live parent work", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: { ...work(1), pendingSync: false } });
    await trackedChaptersItem.setValue({
      "1:11": {
        workId: 1,
        chapterId: 11,
        lastReadAt: time,
        markedCompleteAt: null,
        readProgress: 0,
        deleted: true,
        pendingSync: true,
      },
    });
    const fetchMock = installFetch();
    await runSync();
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(parsePosted(posted)).toMatchObject({
      works: [expect.objectContaining({ workId: 1 })],
      chapters: [expect.objectContaining({ workId: 1, chapterId: 11, deleted: true })],
    });
  });

  it("includes page events received during GET without overwriting their progress", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: work(1) });
    const pull = deferred<Response>();
    const requested = deferred<void>();
    const fetchMock = installFetch(async (_input, init) => {
      if (init?.method === "POST") return postResponse();
      requested.resolve();
      return pull.promise;
    });
    const syncing = runSync();
    await requested.promise;
    await withLocalState(() =>
      ingestPageEvent({
        type: "scrollProgress",
        url: "https://archiveofourown.org/works/2",
        chapterId: "22",
        scrollPercentage: 90,
      }),
    );
    pull.resolve(response(remote()));
    await syncing;
    expect((await trackedWorksItem.getValue())[2]).toBeDefined();
    expect((await trackedChaptersItem.getValue())["2:22"]?.readProgress).toBe(0.9);
    const posted = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(parsePosted(posted).chapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workId: 2, chapterId: 22, readProgress: 0.9 }),
      ]),
    );
  });

  it("keeps edits made during POST pending even when the server cursor is ahead", async () => {
    await setAuthSession("alice", baseUrl);
    await withLocalState(() =>
      ingestPageEvent({
        type: "scrollProgress",
        url: "https://archiveofourown.org/works/1/chapters/11",
        scrollPercentage: 10,
      }),
    );
    const saved = await saveSearch("Before", "https://archiveofourown.org/works?x=1");
    await toggleFavouriteTag(1, "Test", true);
    const upload = deferred<Response>();
    const requested = deferred<void>();
    installFetch(async (_input, init) => {
      if (init?.method !== "POST") return response(remote());
      requested.resolve();
      return upload.promise;
    });
    const syncing = runSync();
    await requested.promise;
    await withLocalState(async () => {
      await ingestPageEvent({
        type: "scrollProgress",
        url: "https://archiveofourown.org/works/1/chapters/11",
        scrollPercentage: 90,
      });
      await ingestPageEvent({
        type: "scrollProgress",
        url: "https://archiveofourown.org/works/2/chapters/22",
        scrollPercentage: 50,
      });
      await renameSavedSearch(saved.id, "After");
      await toggleFavouriteTag(1, "Test", false);
    });
    upload.resolve(postResponse());
    await syncing;
    expect((await trackedWorksItem.getValue())[2]?.pendingSync).toBe(true);
    expect((await trackedChaptersItem.getValue())["1:11"]).toMatchObject({
      readProgress: 0.9,
      pendingSync: true,
    });
    expect((await savedSearchesItem.getValue())[0]).toMatchObject({
      name: "After",
      pendingSync: true,
    });
    expect((await favouriteTagsItem.getValue())[0]).toMatchObject({
      favourited: false,
      pendingSync: true,
    });
    const retry = installFetch();
    await runSync();
    const posted = retry.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
    expect(parsePosted(posted)).toMatchObject({
      savedSearches: [expect.objectContaining({ name: "After" })],
      favouriteTags: [expect.objectContaining({ favourited: false })],
    });
    expect((await savedSearchesItem.getValue())[0]?.pendingSync).toBe(false);
  });

  it("discards a previous account's pull after switching accounts", async () => {
    await setAuthSession("alice", baseUrl);
    const pull = deferred<Response>();
    const requested = deferred<void>();
    const fetchMock = installFetch(async () => {
      requested.resolve();
      return pull.promise;
    });
    const syncing = runSync();
    const rejected = expect(syncing).rejects.toBeInstanceOf(StaleSyncSessionError);
    await requested.promise;
    await setAuthSession("bob", baseUrl);
    pull.resolve(response(remote({ works: [work(1)] })));
    await rejected;
    expect((await accountContextItem.getValue())?.userId).toBe("bob");
    expect(await trackedWorksItem.getValue()).toEqual({});
    expect(await lastSyncedAtItem.getValue()).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("does not acknowledge an old account's upload in the new account", async () => {
    await setAuthSession("alice", baseUrl);
    await trackedWorksItem.setValue({ 1: work(1) });
    const upload = deferred<Response>();
    const requested = deferred<void>();
    installFetch(async (_input, init) => {
      if (init?.method !== "POST") return response(remote());
      requested.resolve();
      return upload.promise;
    });
    const syncing = runSync();
    const rejected = expect(syncing).rejects.toBeInstanceOf(StaleSyncSessionError);
    await requested.promise;
    await setAuthSession("bob", baseUrl);
    upload.resolve(postResponse());
    await rejected;
    expect(await trackedWorksItem.getValue()).toEqual({});
    await setAuthSession("alice", baseUrl);
    expect((await trackedWorksItem.getValue())[1]?.pendingSync).toBe(true);
  });
});

it("replaces tags only for returned works, including empty tag sets", async () => {
  await setAuthSession("alice", baseUrl);
  await tagMetadataItem.setValue([
    { workId: 1, tag: "Old", href: null, type: "fandom" },
    { workId: 2, tag: "Keep", href: null, type: "fandom" },
  ]);
  installFetch(async () => response(remote({ works: [{ ...work(1), pendingSync: false }] })));
  await runSync();
  expect(await tagMetadataItem.getValue()).toEqual([
    { workId: 2, tag: "Keep", href: null, type: "fandom" },
  ]);
});

it("uses the extracted chapter ID on a work URL and accepts older URL-only events", async () => {
  await ingestPageEvent({
    type: "scrollProgress",
    url: "https://archiveofourown.org/works/123",
    chapterId: "456",
    scrollPercentage: 80,
  });
  await ingestPageEvent({
    type: "scrollProgress",
    url: "https://archiveofourown.org/works/123/chapters/789",
    scrollPercentage: 30,
  });
  expect((await trackedChaptersItem.getValue())["123:456"]?.readProgress).toBe(0.8);
  expect((await trackedChaptersItem.getValue())["123:789"]?.readProgress).toBe(0.3);
  expect((await trackedChaptersItem.getValue())["123:0"]).toBeUndefined();
});
