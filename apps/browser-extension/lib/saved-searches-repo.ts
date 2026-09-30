import type { SavedSearchItem } from "@qcksys/ao3tracker-core";
import { mergeSavedSearches } from "@qcksys/ao3tracker-sync-client";
import { savedSearchesItem } from "./storage";
import { nextUpdatedAt } from "./local-state";

/**
 * Save a new named search. Generates a stable client-side id so the row can be
 * renamed without changing identity. Returns the stored row.
 */
export async function saveSearch(name: string, url: string): Promise<SavedSearchItem> {
  const current = await savedSearchesItem.getValue();
  const row = {
    id: crypto.randomUUID(),
    name,
    url,
    deleted: false,
    updatedAt: new Date().toISOString(),
    pendingSync: true,
  };
  await savedSearchesItem.setValue([...current, row]);
  return row;
}

/** Rename a saved search in place, bumping `updatedAt` so the change syncs. */
export async function renameSavedSearch(id: string, name: string): Promise<SavedSearchItem | null> {
  const current = await savedSearchesItem.getValue();
  const existing = current.find((row) => row.id === id);
  if (!existing) return null;
  const row = {
    ...existing,
    name,
    updatedAt: nextUpdatedAt(existing.updatedAt),
    pendingSync: true,
  };
  await savedSearchesItem.setValue(current.map((r) => (r.id === id ? row : r)));
  return row;
}

/**
 * Delete a saved search. Tombstones the row (deleted=true) rather than removing
 * it, so the deletion syncs to other devices via LWW.
 */
export async function deleteSavedSearch(id: string): Promise<void> {
  const current = await savedSearchesItem.getValue();
  const existing = current.find((row) => row.id === id);
  if (!existing) return;
  const row = {
    ...existing,
    deleted: true,
    updatedAt: nextUpdatedAt(existing.updatedAt),
    pendingSync: true,
  };
  await savedSearchesItem.setValue(current.map((r) => (r.id === id ? row : r)));
}

/** Apply a server delta on top of the local store (LWW per row, keyed by id). */
export async function applyRemoteSavedSearches(
  remote: ReadonlyArray<SavedSearchItem>,
): Promise<SavedSearchItem[]> {
  const local = await savedSearchesItem.getValue();
  const merged = mergeSavedSearches(local, remote).map((row) => {
    const previous = local.find((item) => item.id === row.id);
    const incoming = remote.find((item) => item.id === row.id);
    const remoteWon =
      incoming && (!previous || Date.parse(incoming.updatedAt) >= Date.parse(previous.updatedAt));
    return { ...row, pendingSync: remoteWon ? false : (previous?.pendingSync ?? true) };
  });
  await savedSearchesItem.setValue(merged);
  return merged;
}

/**
 * Missing flags belong to the legacy store and are safely retried once.
 */
export async function savedSearchesToPush(): Promise<SavedSearchItem[]> {
  const rows = await savedSearchesItem.getValue();
  return rows.filter((row) => row.pendingSync !== false);
}
