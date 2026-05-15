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

/**
 * Pre-defined api environments selectable from the Settings dropdown. The
 * stored `apiBaseUrlItem` value must always be one of these `url`s so the
 * popup's auth client + sync transport hit a known host (also kept in sync
 * with manifest `host_permissions` in `wxt.config.ts`).
 */
export interface ApiBaseUrlPreset {
  id: "prod" | "dev" | "proxy" | "local";
  label: string;
  url: string;
}

export const apiBaseUrlPresets = [
  { id: "prod", label: "Prod", url: "https://ao3tracker.com" },
  { id: "dev", label: "Dev", url: "https://dev.ao3tracker.com" },
  {
    id: "proxy",
    label: "Proxy (cloudflared → local)",
    url: "https://qcksys-ao3tracker-api-local.ta2.dev",
  },
  {
    id: "local",
    label: "Local (portless)",
    url: "https://ao3tracker.localhost",
  },
] as const satisfies readonly ApiBaseUrlPreset[];

export const apiBaseUrlItem = storage.defineItem<string>("local:apiBaseUrl", {
  fallback: apiBaseUrlPresets[0].url,
});

export const authTokenItem = storage.defineItem<string | null>("local:authToken", {
  fallback: null,
});

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

/**
 * The highest notification id we've already surfaced as a chrome notification.
 * Persisted so a service-worker restart doesn't re-fire old alerts.
 */
export const lastSeenNotificationIdItem = storage.defineItem<number | null>(
  "local:lastSeenNotificationId",
  { fallback: null },
);

/**
 * Whether the background worker should poll for new notifications and surface
 * chrome notifications. Defaults to true so users get push by default after
 * sign-in (matching native KMP behaviour).
 */
export const notificationsEnabledItem = storage.defineItem<boolean>(
  "local:notificationsEnabled",
  { fallback: true },
);

/**
 * Map of chrome notification id → AO3 work id. Lets the click handler look up
 * which work to open without re-fetching from the api.
 */
export const notificationWorkIdsItem = storage.defineItem<
  Record<string, number>
>("local:notificationWorkIds", { fallback: {} });

export const chapterKey = (workId: number, chapterId: number): string =>
  `${workId}:${chapterId}`;
