import type { FavouriteTagItem, TagTypeId } from "@qcksys/ao3tracker-core";
import { favouriteTagKey } from "@qcksys/ao3tracker-core";
import { mergeFavouriteTags } from "@qcksys/ao3tracker-sync-client";
import { favouriteTagsItem } from "./storage";
import { nextUpdatedAt } from "./local-state";

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
  const key = favouriteTagKey(tagType, tag);
  const updatedAt = nextUpdatedAt(
    current.find((row) => favouriteTagKey(row.tagType, row.tag) === key)?.updatedAt,
  );

  const next = current.filter((row) => favouriteTagKey(row.tagType, row.tag) !== key);
  const row = { tagType, tag, favourited, updatedAt, pendingSync: true };
  next.push(row);
  await favouriteTagsItem.setValue(next);
  return row;
}

/** Apply a server delta on top of the local store (LWW per row). */
export async function applyRemoteFavouriteTags(
  remote: ReadonlyArray<FavouriteTagItem>,
): Promise<FavouriteTagItem[]> {
  const local = await favouriteTagsItem.getValue();
  const merged = mergeFavouriteTags(local, remote).map((row) => {
    const key = favouriteTagKey(row.tagType, row.tag);
    const previous = local.find((item) => favouriteTagKey(item.tagType, item.tag) === key);
    const incoming = remote.find((item) => favouriteTagKey(item.tagType, item.tag) === key);
    const remoteWon =
      incoming && (!previous || Date.parse(incoming.updatedAt) >= Date.parse(previous.updatedAt));
    return { ...row, pendingSync: remoteWon ? false : (previous?.pendingSync ?? true) };
  });
  await favouriteTagsItem.setValue(merged);
  return merged;
}

/**
 * Missing flags belong to the legacy store and are safely retried once.
 */
export async function favouriteTagsToPush(): Promise<FavouriteTagItem[]> {
  const rows = await favouriteTagsItem.getValue();
  return rows.filter((row) => row.pendingSync !== false);
}
