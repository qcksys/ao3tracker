import { and, eq, gte, inArray } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import { replaceWhenNewer, sameDate } from "~/db/helpers/sync";
import {
  type TUserSavedSearchI,
  type TUserSavedSearchS,
  tUserSavedSearch,
} from "~/db/schema/user.savedSearch";

/** Per-row record returned in sync responses (only the fields the wire needs) */
export type SavedSearchRecord = Pick<
  TUserSavedSearchS,
  "id" | "name" | "url" | "deleted" | "updatedAt"
>;

/** Per-row payload for upsert from client */
export type SavedSearchUpsert = Pick<
  TUserSavedSearchI,
  "id" | "name" | "url" | "deleted" | "updatedAt"
>;

/** Result of LWW-merging a single incoming saved-search row */
export type SavedSearchSyncResult = {
  id: string;
  status: "accepted" | "ignored";
};

/**
 * Pure helper: decide which incoming saved-search rows win LWW against the
 * currently-stored timestamps, and return the per-row sync results plus the
 * rows that need to be upserted.
 *
 * Rows are keyed by their client-generated `id`. Server wins on equal
 * timestamps (client must be strictly newer).
 *
 * Exported for unit testing; the route uses it via `batchUpsertSavedSearches`.
 */
export function resolveSavedSearchMerge(
  items: SavedSearchUpsert[],
  existing: Map<string, Date>,
): {
  toUpsert: SavedSearchUpsert[];
  results: SavedSearchSyncResult[];
} {
  const toUpsert: SavedSearchUpsert[] = [];
  const results: SavedSearchSyncResult[] = [];

  for (const item of items) {
    const existingTs = existing.get(item.id);

    if (existingTs && existingTs >= item.updatedAt) {
      results.push({ id: item.id, status: "ignored" });
    } else {
      toUpsert.push(item);
      results.push({ id: item.id, status: "accepted" });
    }
  }

  return { toUpsert, results };
}

/**
 * Fetch the user's saved-search rows that have changed since `since`.
 *
 * Full and incremental sync both include tombstones (`deleted = true`) so
 * resetting a cursor can reconcile an existing client's offline state.
 */
export async function getSavedSearchesSince(
  db: TDatabase,
  userId: string,
  since: Date | null,
): Promise<SavedSearchRecord[]> {
  const where = since
    ? and(eq(tUserSavedSearch.userId, userId), gte(tUserSavedSearch.rowUpdatedAt, since))
    : eq(tUserSavedSearch.userId, userId);

  const rows = await db
    .select({
      id: tUserSavedSearch.id,
      name: tUserSavedSearch.name,
      url: tUserSavedSearch.url,
      deleted: tUserSavedSearch.deleted,
      updatedAt: tUserSavedSearch.updatedAt,
    })
    .from(tUserSavedSearch)
    .where(where);

  return rows;
}

/**
 * LWW-merge a batch of incoming saved-search rows.
 *
 * For each incoming row:
 * - If no server row exists, insert it (always accepted).
 * - If a server row exists and the incoming `updatedAt` is strictly greater, overwrite it.
 * - Otherwise, ignore the incoming row.
 *
 * Returns a per-row status for the client.
 */
export async function batchUpsertSavedSearches(
  db: TDatabase,
  userId: string,
  items: SavedSearchUpsert[],
): Promise<SavedSearchSyncResult[]> {
  if (items.length === 0) return [];

  // Pre-fetch existing rows for the incoming ids so we can LWW in memory.
  const ids = [...new Set(items.map((i) => i.id))];
  const existing = await db
    .select({
      id: tUserSavedSearch.id,
      updatedAt: tUserSavedSearch.updatedAt,
    })
    .from(tUserSavedSearch)
    .where(and(eq(tUserSavedSearch.userId, userId), inArray(tUserSavedSearch.id, ids)));

  const existingById = new Map<string, Date>();
  for (const row of existing) existingById.set(row.id, row.updatedAt);

  const { toUpsert, results } = resolveSavedSearchMerge(items, existingById);

  if (toUpsert.length > 0) {
    const rows: TUserSavedSearchI[] = toUpsert.map((u) => ({
      userId,
      id: u.id,
      name: u.name,
      url: u.url,
      deleted: u.deleted,
      updatedAt: u.updatedAt,
    }));
    await db
      .insert(tUserSavedSearch)
      .values(rows)
      .onDuplicateKeyUpdate({
        set: {
          name: replaceWhenNewer(tUserSavedSearch.name, tUserSavedSearch.updatedAt),
          url: replaceWhenNewer(tUserSavedSearch.url, tUserSavedSearch.updatedAt),
          deleted: replaceWhenNewer(tUserSavedSearch.deleted, tUserSavedSearch.updatedAt),
          updatedAt: replaceWhenNewer(tUserSavedSearch.updatedAt, tUserSavedSearch.updatedAt),
        },
      });

    const stored = await db
      .select()
      .from(tUserSavedSearch)
      .where(and(eq(tUserSavedSearch.userId, userId), inArray(tUserSavedSearch.id, ids)));
    const byId = new Map(stored.map((row) => [row.id, row]));
    return items.map((item) => {
      const current = byId.get(item.id);
      return {
        id: item.id,
        status:
          current &&
          sameDate(current.updatedAt, item.updatedAt) &&
          current.name === item.name &&
          current.url === item.url &&
          current.deleted === item.deleted
            ? "accepted"
            : "ignored",
      };
    });
  }

  return results;
}
