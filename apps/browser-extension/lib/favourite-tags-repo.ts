import type { FavouriteTagItem, TagTypeId } from "@qcksys/ao3tracker-core";
import { favouriteTagKey } from "@qcksys/ao3tracker-core";
import { mergeFavouriteTags } from "@qcksys/ao3tracker-sync-client";
import { favouriteTagsItem } from "./storage";

/**
 * Toggle a favourite tag in place. Tombstones an existing row to false rather
 * than removing it, so the change syncs to other devices via LWW. Returns the
 * stored row (always with the latest `updatedAt`).
 */
export async function toggleFavouriteTag(
  tagType: TagTypeId,
  tag: string,
  favourited: boolean,
): Promise<FavouriteTagItem> {
  const current = await favouriteTagsItem.getValue();
  const updatedAt = new Date().toISOString();
  const key = favouriteTagKey(tagType, tag);

  const next = current.filter((row) => favouriteTagKey(row.tagType, row.tag) !== key);
  const row: FavouriteTagItem = { tagType, tag, favourited, updatedAt };
  next.push(row);
  await favouriteTagsItem.setValue(next);
  return row;
}

/** Apply a server delta on top of the local store (LWW per row). */
export async function applyRemoteFavouriteTags(
  remote: ReadonlyArray<FavouriteTagItem>,
): Promise<FavouriteTagItem[]> {
  const local = await favouriteTagsItem.getValue();
  const merged = mergeFavouriteTags(local, remote);
  await favouriteTagsItem.setValue(merged);
  return merged;
}

/**
 * Rows that need to be pushed to the server. A simple heuristic: anything
 * updated after the last successful sync. The caller passes the cutoff so we
 * don't keep a per-row pendingSync flag for this table.
 */
export async function favouriteTagsToPush(
  lastSyncedAt: string | null,
): Promise<FavouriteTagItem[]> {
  const rows = await favouriteTagsItem.getValue();
  if (lastSyncedAt === null) return rows;
  const cutoff = Date.parse(lastSyncedAt);
  return rows.filter((row) => Date.parse(row.updatedAt) > cutoff);
}
