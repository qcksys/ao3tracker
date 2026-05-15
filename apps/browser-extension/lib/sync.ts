import type { FavouriteTagItem } from "@qcksys/ao3tracker-core";
import {
  getFullSync,
  postSync,
  type SyncClientConfig,
  SyncApiError,
} from "@qcksys/ao3tracker-sync-client";
import {
  apiBaseUrlItem,
  authTokenItem,
  lastSyncedAtItem,
  lastSyncErrorItem,
  trackedChaptersItem,
  type TrackedChapter,
  type TrackedWork,
  trackedWorksItem,
  workMetadataItem,
  tagMetadataItem,
} from "./storage";
import { applyRemoteFavouriteTags, favouriteTagsToPush } from "./favourite-tags-repo";

/**
 * Build the sync client config from current storage. Sync runs at the
 * background-script tier so we always have a real fetch impl.
 */
async function buildConfig(): Promise<SyncClientConfig> {
  const baseUrl = await apiBaseUrlItem.getValue();
  return {
    baseUrl,
    getBearerToken: () => authTokenItem.getValue(),
    includeCredentials: false,
  };
}

const POST_BATCH_SIZE = 50;

/**
 * Pull all server changes since `lastSyncedAt`, merge into local state, push
 * any pending local rows, and record the new `serverLastUpdated`. Throws on
 * network or schema errors; the caller should record the message and
 * surface it to the popup.
 */
export async function runSync(): Promise<{ pushed: number; pulled: number }> {
  const cfg = await buildConfig();
  const [lastSyncedAt, localWorks, localChapters, metadata] = await Promise.all([
    lastSyncedAtItem.getValue(),
    trackedWorksItem.getValue(),
    trackedChaptersItem.getValue(),
    workMetadataItem.getValue(),
  ]);

  // 1. Pull server state.
  const remote = await getFullSync(cfg, lastSyncedAt ? { lastSyncedAt } : {});

  // 2. Merge remote works/chapters into local stores. Server is authoritative
  // for fields it returns; we LWW per-field via lastReadAt comparisons.
  for (const r of remote.works) {
    const local = localWorks[r.workId];
    if (!local || Date.parse(r.lastReadAt) >= Date.parse(local.lastReadAt)) {
      localWorks[r.workId] = { ...r, pendingSync: false };
    }
  }

  for (const r of remote.chapters) {
    const key = `${r.workId}:${r.chapterId}`;
    const local = localChapters[key];
    if (!local || Date.parse(r.lastReadAt) >= Date.parse(local.lastReadAt)) {
      localChapters[key] = {
        workId: r.workId,
        chapterId: r.chapterId,
        lastReadAt: r.lastReadAt,
        markedCompleteAt: r.markedCompleteAt,
        readProgress: r.readProgress,
        pendingSync: false,
      };
    }
  }

  // 3. Cache metadata for badge rendering + popup display.
  for (const m of remote.workMetadata) metadata[m.id] = m;

  const metadataWrites: Promise<unknown>[] = [];
  if (remote.workMetadata.length > 0) {
    metadataWrites.push(workMetadataItem.setValue(metadata));
  }
  if (remote.tagMetadata.length > 0) {
    metadataWrites.push(tagMetadataItem.setValue(remote.tagMetadata));
  }
  if (remote.favouriteTags && remote.favouriteTags.length > 0) {
    metadataWrites.push(applyRemoteFavouriteTags(remote.favouriteTags));
  }
  await Promise.all(metadataWrites);

  // 4. Push local rows that diverge from the server, in batches of
  // POST_BATCH_SIZE works (the api enforces this and rejects larger requests,
  // and chapters must reference a work in the same request).
  const worksToPush = Object.values(localWorks).filter((w) => w.pendingSync);
  const chaptersToPush = Object.values(localChapters).filter((c) => c.pendingSync);
  const favouriteTagsPush = await favouriteTagsToPush(lastSyncedAt);

  const pushedWorkIds = new Set<number>();
  let favouritesSent = false;
  for (let i = 0; i < worksToPush.length; i += POST_BATCH_SIZE) {
    const works = worksToPush.slice(i, i + POST_BATCH_SIZE);
    const workIdSet = new Set(works.map((w) => w.workId));
    const chapters = chaptersToPush.filter((c) => workIdSet.has(c.workId));
    await postSyncBatch(cfg, works, chapters, favouritesSent ? [] : favouriteTagsPush);
    favouritesSent = true;
    for (const w of works) {
      pushedWorkIds.add(w.workId);
      const stored = localWorks[w.workId];
      if (stored) stored.pendingSync = false;
    }
    for (const c of chapters) {
      const stored = localChapters[`${c.workId}:${c.chapterId}`];
      if (stored) stored.pendingSync = false;
    }
  }

  // Favourite tags stand alone if there were no works to piggy-back on.
  if (!favouritesSent && favouriteTagsPush.length > 0) {
    await postSyncBatch(cfg, [], [], favouriteTagsPush);
  }

  const writes: Promise<unknown>[] = [
    lastSyncedAtItem.setValue(remote.serverLastUpdated),
    lastSyncErrorItem.setValue(null),
  ];
  if (remote.works.length > 0 || pushedWorkIds.size > 0) {
    writes.push(trackedWorksItem.setValue(localWorks));
  }
  if (remote.chapters.length > 0 || chaptersToPush.length > 0) {
    writes.push(trackedChaptersItem.setValue(localChapters));
  }
  await Promise.all(writes);
  return { pushed: pushedWorkIds.size, pulled: remote.works.length };
}

async function postSyncBatch(
  cfg: SyncClientConfig,
  works: TrackedWork[],
  chapters: TrackedChapter[],
  favouriteTags: FavouriteTagItem[],
): Promise<void> {
  if (works.length === 0 && chapters.length === 0 && favouriteTags.length === 0) return;
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
    })),
    favouriteTags: favouriteTags.length > 0 ? favouriteTags : undefined,
  });
}

export function isAuthError(err: unknown): boolean {
  return err instanceof SyncApiError && err.status === 401;
}
