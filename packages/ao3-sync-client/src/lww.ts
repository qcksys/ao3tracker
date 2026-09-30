import type { FavouriteTagItem, SavedSearchItem } from "@qcksys/ao3tracker-core";
import { favouriteTagKey } from "@qcksys/ao3tracker-core";

/**
 * Per-row LWW for favourite-tag entries. Mirrors `resolveFavouriteTagMerge`
 * on the server (apps/api/src/db/queries/user-favourite-tag.ts). Server wins
 * on tie — but locally we treat the remote row as the authoritative side, so
 * "server wins" on tie maps to "remote wins on tie".
 */
export function mergeFavouriteTags(
  local: ReadonlyArray<FavouriteTagItem>,
  remote: ReadonlyArray<FavouriteTagItem>,
): FavouriteTagItem[] {
  const byKey = new Map<string, FavouriteTagItem>();
  for (const row of local) {
    byKey.set(favouriteTagKey(row.tagType, row.tag), row);
  }
  for (const row of remote) {
    const key = favouriteTagKey(row.tagType, row.tag);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const localTs = Date.parse(existing.updatedAt);
    const remoteTs = Date.parse(row.updatedAt);
    if (remoteTs >= localTs) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Per-row LWW for saved-search entries, keyed by the client-generated `id`
 * (so renames don't change identity and two searches can share a URL).
 * Mirrors `resolveSavedSearchMerge` on the server
 * (apps/api/src/db/queries/user-saved-search.ts). Remote wins on tie.
 */
export function mergeSavedSearches(
  local: ReadonlyArray<SavedSearchItem>,
  remote: ReadonlyArray<SavedSearchItem>,
): SavedSearchItem[] {
  const byId = new Map<string, SavedSearchItem>();
  for (const row of local) {
    byId.set(row.id, row);
  }
  for (const row of remote) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    const localTs = Date.parse(existing.updatedAt);
    const remoteTs = Date.parse(row.updatedAt);
    if (remoteTs >= localTs) {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

/**
 * Take a set of currently-favourited (tagType, tag) keys and return the
 * subset of `merged` that should be displayed (favourited=true rows).
 */
export function liveFavouriteTagSet(rows: ReadonlyArray<FavouriteTagItem>): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.favourited) out.add(favouriteTagKey(row.tagType, row.tag));
  }
  return out;
}
