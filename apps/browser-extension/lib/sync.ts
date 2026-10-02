import {
  favouriteTagKey,
  type FavouriteTagItem,
  type SavedSearchItem,
  type SyncWorkRow,
} from "@qcksys/ao3tracker-core";
import {
  getFullSync,
  postSync,
  type SyncClientConfig,
  SyncApiError,
} from "@qcksys/ao3tracker-sync-client";
import {
  favouriteTagsItem,
  chapterMetadataItem,
  lastSyncedAtItem,
  lastSyncErrorItem,
  savedSearchesItem,
  trackedChaptersItem,
  type TrackedChapter,
  type TrackedWork,
  trackedWorksItem,
  workMetadataItem,
  tagMetadataItem,
} from "./storage";
import { applyRemoteFavouriteTags, favouriteTagsToPush } from "./favourite-tags-repo";
import { applyRemoteSavedSearches, savedSearchesToPush } from "./saved-searches-repo";
import { captureSyncSession, isCurrentSession, type SyncSession } from "./account-state";
import { withLocalState } from "./local-state";

/**
 * Build the sync client config from current storage. Sync runs at the
 * background-script tier so we always have a real fetch impl.
 */
function buildConfig(session: SyncSession): SyncClientConfig {
  return {
    baseUrl: session.baseUrl,
    getBearerToken: () => session.token,
    includeCredentials: false,
    fetchImpl: async (...args) => {
      await requireCurrentSession(session);
      try {
        const response = await fetch(...args);
        await requireCurrentSession(session);
        return response;
      } catch (error) {
        await requireCurrentSession(session);
        throw error;
      }
    },
  };
}

const POST_BATCH_SIZE = 50;
const EXTRAS_BATCH_SIZE = 500;

export class StaleSyncSessionError extends Error {
  constructor() {
    super("The account changed during synchronization");
  }
}

async function requireCurrentSession(session: SyncSession): Promise<void> {
  if (!(await isCurrentSession(session))) throw new StaleSyncSessionError();
}

function sameVersion(current: unknown, uploaded: unknown): boolean {
  return JSON.stringify(current) === JSON.stringify(uploaded);
}

function mergeWork(local: TrackedWork | undefined, remote: SyncWorkRow): TrackedWork {
  if (!local) return { ...remote, pendingSync: false };
  const remoteReadWins = Date.parse(remote.lastReadAt) >= Date.parse(local.lastReadAt);
  if (remote.deleted && remoteReadWins) return { ...remote, pendingSync: false };
  if (local.deleted && !remoteReadWins) return local;
  const remoteFieldWins = (localAt: string | null, remoteAt: string | null): boolean => {
    if (localAt === null && remoteAt === null) return remoteReadWins;
    if (localAt === null) return true;
    if (remoteAt === null) return false;
    return Date.parse(remoteAt) >= Date.parse(localAt);
  };
  const subscribed = remoteFieldWins(local.subscribedUpdatedAt, remote.subscribedUpdatedAt)
    ? remote
    : local;
  const favourite = remoteFieldWins(local.favouriteUpdatedAt, remote.favouriteUpdatedAt)
    ? remote
    : local;
  const reading = remoteReadWins ? remote : local;
  const merged: SyncWorkRow = {
    ...remote,
    lastReadAt: reading.lastReadAt,
    markedCompleteAt: reading.markedCompleteAt,
    private: reading.private,
    deleted: reading.deleted,
    subscribed: subscribed.subscribed,
    subscribedUpdatedAt: subscribed.subscribedUpdatedAt,
    favourite: favourite.favourite,
    favouriteUpdatedAt: favourite.favouriteUpdatedAt,
  };
  return { ...merged, pendingSync: local.pendingSync && !sameVersion(merged, remote) };
}

/**
 * Pull all server changes since `lastSyncedAt`, merge into local state, push
 * any pending local rows, and record the new `serverLastUpdated`. Throws on
 * network or schema errors; the caller should record the message and
 * surface it to the popup.
 */
export async function runSync(): Promise<{ pushed: number; pulled: number }> {
  const session = await captureSyncSession();
  if (!session) return { pushed: 0, pulled: 0 };
  try {
    return await syncSession(session);
  } catch (error) {
    await requireCurrentSession(session);
    throw error;
  }
}

async function syncSession(session: SyncSession): Promise<{ pushed: number; pulled: number }> {
  const cfg = buildConfig(session);
  const lastSyncedAt = await withLocalState(async () => {
    await requireCurrentSession(session);
    return lastSyncedAtItem.getValue();
  });
  const remote = await getFullSync(cfg, lastSyncedAt ? { lastSyncedAt } : {});
  // Re-read under the mutation queue after the network request. Page events
  // that arrived during the pull must participate in the merge.
  const pending = await withLocalState(async () => {
    await requireCurrentSession(session);
    const [works, chapters, metadata, tags, chapterMetadata] = await Promise.all([
      trackedWorksItem.getValue(),
      trackedChaptersItem.getValue(),
      workMetadataItem.getValue(),
      tagMetadataItem.getValue(),
      chapterMetadataItem.getValue(),
    ]);
    for (const row of remote.works) {
      works[row.workId] = mergeWork(works[row.workId], row);
    }
    for (const row of remote.chapters) {
      const key = `${row.workId}:${row.chapterId}`;
      const local = chapters[key];
      if (!local || Date.parse(row.lastReadAt) >= Date.parse(local.lastReadAt)) {
        if (row.deleted) delete chapters[key];
        else chapters[key] = { ...row, pendingSync: false };
      }
    }
    for (const row of remote.workMetadata) metadata[row.id] = row;
    const returnedIds = new Set(remote.works.map((row) => row.workId));
    for (const workId of returnedIds) chapterMetadata[workId] = [];
    for (const chapter of remote.chapterMetadata) {
      (chapterMetadata[chapter.workId] ??= []).push(chapter);
    }
    await Promise.all([
      trackedWorksItem.setValue(works),
      trackedChaptersItem.setValue(chapters),
      workMetadataItem.setValue(metadata),
      chapterMetadataItem.setValue(chapterMetadata),
      tagMetadataItem.setValue(
        tags.filter((tag) => !returnedIds.has(tag.workId)).concat(remote.tagMetadata),
      ),
      applyRemoteFavouriteTags(remote.favouriteTags ?? []),
      applyRemoteSavedSearches(remote.savedSearches ?? []),
    ]);
    const chaptersToPush = Object.values(chapters).filter(
      (row) => row.pendingSync && !works[row.workId]?.deleted,
    );
    const chapterWorkIds = new Set(chaptersToPush.map((row) => row.workId));
    return {
      works: Object.values(works).filter(
        (row) => row.pendingSync || chapterWorkIds.has(row.workId),
      ),
      chapters: chaptersToPush,
      favourites: await favouriteTagsToPush(),
      searches: await savedSearchesToPush(),
    };
  });
  const pushedWorkIds = new Set<number>();
  const batches = Math.max(
    Math.ceil(pending.works.length / POST_BATCH_SIZE),
    Math.ceil(pending.favourites.length / EXTRAS_BATCH_SIZE),
    Math.ceil(pending.searches.length / EXTRAS_BATCH_SIZE),
  );
  for (let batch = 0; batch < batches; batch++) {
    const works = pending.works.slice(batch * POST_BATCH_SIZE, (batch + 1) * POST_BATCH_SIZE);
    const workIdSet = new Set(works.map((w) => w.workId));
    const chapters = pending.chapters.filter((c) => workIdSet.has(c.workId));
    const favourites = pending.favourites.slice(
      batch * EXTRAS_BATCH_SIZE,
      (batch + 1) * EXTRAS_BATCH_SIZE,
    );
    const searches = pending.searches.slice(
      batch * EXTRAS_BATCH_SIZE,
      (batch + 1) * EXTRAS_BATCH_SIZE,
    );
    await postSyncBatch(cfg, works, chapters, favourites, searches);
    await withLocalState(async () => {
      await requireCurrentSession(session);
      const [currentWorks, currentChapters, currentFavourites, currentSearches] = await Promise.all(
        [
          trackedWorksItem.getValue(),
          trackedChaptersItem.getValue(),
          favouriteTagsItem.getValue(),
          savedSearchesItem.getValue(),
        ],
      );
      for (const row of works) {
        pushedWorkIds.add(row.workId);
        const current = currentWorks[row.workId];
        if (current && sameVersion(current, row)) current.pendingSync = false;
      }
      for (const row of chapters) {
        const key = `${row.workId}:${row.chapterId}`;
        const current = currentChapters[key];
        if (current && sameVersion(current, row)) current.pendingSync = false;
      }
      for (const row of currentFavourites) {
        const uploaded = favourites.find(
          (sent) =>
            favouriteTagKey(sent.tagType, sent.tag) === favouriteTagKey(row.tagType, row.tag),
        );
        if (uploaded && sameVersion(row, uploaded)) row.pendingSync = false;
      }
      for (const row of currentSearches) {
        const uploaded = searches.find((sent) => sent.id === row.id);
        if (uploaded && sameVersion(row, uploaded)) row.pendingSync = false;
      }
      await Promise.all([
        trackedWorksItem.setValue(currentWorks),
        trackedChaptersItem.setValue(currentChapters),
        favouriteTagsItem.setValue(currentFavourites),
        savedSearchesItem.setValue(currentSearches),
      ]);
    });
  }
  await withLocalState(async () => {
    await requireCurrentSession(session);
    await Promise.all([
      lastSyncedAtItem.setValue(remote.serverLastUpdated),
      lastSyncErrorItem.setValue(null),
    ]);
  });
  return { pushed: pushedWorkIds.size, pulled: remote.works.length };
}

async function postSyncBatch(
  cfg: SyncClientConfig,
  works: TrackedWork[],
  chapters: TrackedChapter[],
  favouriteTags: FavouriteTagItem[],
  savedSearches: SavedSearchItem[],
): Promise<void> {
  if (
    works.length === 0 &&
    chapters.length === 0 &&
    favouriteTags.length === 0 &&
    savedSearches.length === 0
  )
    return;
  await postSync(cfg, {
    works: works.map((w) => ({
      workId: w.workId,
      lastReadAt: w.lastReadAt,
      markedCompleteAt: w.markedCompleteAt,
      private: w.private,
      subscribed: w.subscribed,
      favourite: w.favourite,
      subscribedUpdatedAt: w.subscribedUpdatedAt,
      favouriteUpdatedAt: w.favouriteUpdatedAt,
      deleted: w.deleted,
    })),
    chapters: chapters.map((c) => ({
      workId: c.workId,
      chapterId: c.chapterId,
      lastReadAt: c.lastReadAt,
      markedCompleteAt: c.markedCompleteAt,
      readProgress: c.readProgress,
      deleted: c.deleted ?? false,
    })),
    favouriteTags: favouriteTags.length > 0 ? favouriteTags : undefined,
    savedSearches: savedSearches.length > 0 ? savedSearches : undefined,
  });
}

export function isAuthError(err: unknown): boolean {
  return err instanceof SyncApiError && err.status === 401;
}
