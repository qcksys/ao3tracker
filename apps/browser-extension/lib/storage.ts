import type { FavouriteTagItem, SyncTagMetadata, SyncWorkMetadata } from "@qcksys/ao3tracker-core";
import { storage } from "@wxt-dev/storage";

/**
 * Persistent state for the extension. Everything here is mirrored in the
 * remote api so a fresh install can re-pull on first sign-in.
 *
 * Tracked-work and tracked-chapter records hold the *local* view; the
 * background worker merges remote sync responses into them. Both use the
 * sync wire shape (ISO strings) so they round-trip without conversion.
 */
export interface TrackedWork {
  workId: number;
  lastReadAt: string;
  markedCompleteAt: string | null;
  private: boolean;
  subscribed: boolean;
  favourite: boolean;
  subscribedUpdatedAt: string | null;
  favouriteUpdatedAt: string | null;
  deleted: boolean;
  /** True if the row has local edits not yet acknowledged by the server. */
  pendingSync: boolean;
}

export interface TrackedChapter {
  workId: number;
  chapterId: number;
  lastReadAt: string;
  markedCompleteAt: string | null;
  readProgress: number;
  pendingSync: boolean;
}

export const apiBaseUrlItem = storage.defineItem<string>("local:apiBaseUrl", {
  fallback: "https://ao3tracker.qcksys.app",
});

export const authTokenItem = storage.defineItem<string | null>("local:authToken", {
  fallback: null,
});

export const userItem = storage.defineItem<{
  id: string;
  email: string | null;
  name: string | null;
} | null>("local:user", { fallback: null });

export const lastSyncedAtItem = storage.defineItem<string | null>("local:lastSyncedAt", {
  fallback: null,
});

export const lastSyncErrorItem = storage.defineItem<string | null>("local:lastSyncError", {
  fallback: null,
});

export const trackedWorksItem = storage.defineItem<Record<number, TrackedWork>>(
  "local:trackedWorks",
  { fallback: {} },
);

export const trackedChaptersItem = storage.defineItem<Record<string, TrackedChapter>>(
  "local:trackedChapters",
  { fallback: {} },
);

export const workMetadataItem = storage.defineItem<Record<number, SyncWorkMetadata>>(
  "local:workMetadata",
  { fallback: {} },
);

export const tagMetadataItem = storage.defineItem<SyncTagMetadata[]>(
  "local:tagMetadata",
  { fallback: [] },
);

export const favouriteTagsItem = storage.defineItem<FavouriteTagItem[]>(
  "local:favouriteTags",
  { fallback: [] },
);

export const chapterKey = (workId: number, chapterId: number): string =>
  `${workId}:${chapterId}`;
