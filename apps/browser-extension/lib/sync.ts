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

/**
 * Pull all server changes since `lastSyncedAt`, merge into local state, push
 * any pending local rows, and record the new `serverLastUpdated`. Throws on
 * network or schema errors; the caller should record the message and
 * surface it to the popup.
 */
export async function runSync(): Promise<{ pushed: number; pulled: number }> {
  const cfg = await buildConfig();
  const lastSyncedAt = await lastSyncedAtItem.getValue();

  // 1. Pull server state.
  const remote = await getFullSync(cfg, lastSyncedAt ? { lastSyncedAt } : {});

  // 2. Merge remote works/chapters into local stores. Server is authoritative
  // for fields it returns; we LWW per-field via lastReadAt comparisons.
  const localWorks = await trackedWorksItem.getValue();
  for (const r of remote.works) {
    const local = localWorks[r.workId];
    if (!local || Date.parse(r.lastReadAt) >= Date.parse(local.lastReadAt)) {
      localWorks[r.workId] = { ...r, pendingSync: false };
    }
  }
  await trackedWorksItem.setValue(localWorks);

  const localChapters = await trackedChaptersItem.getValue();
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
  await trackedChaptersItem.setValue(localChapters);

  // 3. Cache metadata for badge rendering + popup display.
  const metadata = await workMetadataItem.getValue();
  for (const m of remote.workMetadata) metadata[m.id] = m;
  await workMetadataItem.setValue(metadata);

  await tagMetadataItem.setValue(remote.tagMetadata);

  if (remote.favouriteTags && remote.favouriteTags.length > 0) {
    await applyRemoteFavouriteTags(remote.favouriteTags);
  }

  // 4. Push local rows that diverge from the server.
  const worksToPush = Object.values(localWorks).filter((w) => w.pendingSync);
  const chaptersToPush = Object.values(localChapters).filter((c) => c.pendingSync);
  const favouriteTagsPush = await favouriteTagsToPush(lastSyncedAt);

  const pushedWorkIds = new Set<number>();
  if (worksToPush.length > 0 || chaptersToPush.length > 0 || favouriteTagsPush.length > 0) {
    // The API enforces that chapters reference works in the same request, so
    // we send them in batches of 50 works at a time.
    const works = worksToPush.slice(0, 50);
    const workIdSet = new Set(works.map((w) => w.workId));
    const chapters = chaptersToPush.filter((c) => workIdSet.has(c.workId));

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
      favouriteTags: favouriteTagsPush.length > 0 ? favouriteTagsPush : undefined,
    });

    for (const w of works) {
      pushedWorkIds.add(w.workId);
      const stored = localWorks[w.workId];
      if (stored) stored.pendingSync = false;
    }
    for (const c of chapters) {
      const stored = localChapters[`${c.workId}:${c.chapterId}`];
      if (stored) stored.pendingSync = false;
    }
    await trackedWorksItem.setValue(localWorks);
    await trackedChaptersItem.setValue(localChapters);
  }

  await lastSyncedAtItem.setValue(remote.serverLastUpdated);
  await lastSyncErrorItem.setValue(null);
  return { pushed: pushedWorkIds.size, pulled: remote.works.length };
}

export function isAuthError(err: unknown): boolean {
  return err instanceof SyncApiError && err.status === 401;
}
