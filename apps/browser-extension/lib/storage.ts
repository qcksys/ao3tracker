import type {
  FavouriteTagItem,
  SavedSearchItem,
  SyncChapterMetadata,
  SyncTagMetadata,
  SyncWorkMetadata,
} from "@qcksys/ao3tracker-core";
import { storage } from "@wxt-dev/storage";
import type { BrowsingPreferences } from "@qcksys/ao3tracker-core/schemas";

import {
  defaultNotificationPreferences,
  type NotificationPreferences,
} from "@qcksys/ao3tracker-core/notifications";

export const browsingPreferencesItem = storage.defineItem<BrowsingPreferences>(
  "local:browsingPreferences",
  {
    fallback: {
      hiddenWorkIds: [],
      hiddenWorkTitles: {},
      hideCaughtUp: false,
      hiddenTags: [],
      languageFilterEnabled: false,
      searchLanguage: "en",
      maxFandoms: null,
    },
  },
);

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
  deleted?: boolean;
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

/**
 * Presets the running build is allowed to select / resolve to. Production
 * builds ship only the real endpoints (prod + dev); the `proxy`/`local` dev
 * conveniences are stripped so a tampered stored value can't redirect the
 * bearer token to an attacker origin. Beta builds allow only dev; local builds
 * expose all presets.
 */
export const availableApiBaseUrlPresets: readonly ApiBaseUrlPreset[] =
  // Gate on MODE (not PROD) so this stays aligned with the manifest
  // host_permissions in wxt.config.ts, which also keys off `mode`.
  import.meta.env.MODE === "beta"
    ? apiBaseUrlPresets.filter((p) => p.id === "dev")
    : import.meta.env.MODE === "production"
      ? apiBaseUrlPresets.filter((p) => p.id === "prod" || p.id === "dev")
      : apiBaseUrlPresets;

/**
 * Coerce a stored api base url to a known-safe value. The stored item is
 * free-form, so anything that builds a fetch/auth base url must route through
 * here to guarantee the host is one of the build's allowed presets.
 */
export function resolveApiBaseUrl(value: string | null | undefined): string {
  const allowed = availableApiBaseUrlPresets.map((p) => p.url);
  return value && allowed.includes(value) ? value : defaultApiBaseUrl;
}

export const defaultApiBaseUrl =
  import.meta.env.MODE === "beta" ? apiBaseUrlPresets[1].url : apiBaseUrlPresets[0].url;

export const apiBaseUrlItem = storage.defineItem<string>("local:apiBaseUrl", {
  fallback: defaultApiBaseUrl,
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

export const chapterMetadataItem = storage.defineItem<Record<number, SyncChapterMetadata[]>>(
  "local:chapterMetadata",
  { fallback: {} },
);

export const tagMetadataItem = storage.defineItem<SyncTagMetadata[]>("local:tagMetadata", {
  fallback: [],
});

export type LocalFavouriteTag = FavouriteTagItem & { pendingSync?: boolean };
export type LocalSavedSearch = SavedSearchItem & { pendingSync?: boolean };

export const favouriteTagsItem = storage.defineItem<LocalFavouriteTag[]>("local:favouriteTags", {
  fallback: [],
});

/**
 * Named AO3 filter/search URLs the user saved from a list page. Per-row LWW
 * (id-keyed) so renames/deletes converge across devices; mirrored remotely.
 */
export const savedSearchesItem = storage.defineItem<LocalSavedSearch[]>("local:savedSearches", {
  fallback: [],
});

/**
 * The highest notification id we've already surfaced as a chrome notification.
 * Persisted so a service-worker restart doesn't re-fire old alerts.
 */
export const lastSeenNotificationIdItem = storage.defineItem<number | null>(
  "local:lastSeenNotificationId",
  { fallback: null },
);

// Read the original toggle when upgrading an existing installation.
export const notificationsEnabledItem = storage.defineItem<boolean>("local:notificationsEnabled", {
  fallback: true,
});

export const notificationPreferencesItem = storage.defineItem<NotificationPreferences | null>(
  "local:notificationPreferences",
  { fallback: null },
);

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return (
    (await notificationPreferencesItem.getValue()) ?? {
      ...defaultNotificationPreferences,
      enabled: await notificationsEnabledItem.getValue(),
    }
  );
}

/**
 * Map of chrome notification id → AO3 work id. Lets the click handler look up
 * which work to open without re-fetching from the api.
 */
export const notificationWorkIdsItem = storage.defineItem<Record<string, number>>(
  "local:notificationWorkIds",
  { fallback: {} },
);

export const chapterKey = (workId: number, chapterId: number): string => `${workId}:${chapterId}`;
