import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
    type TUserFavouriteTagI,
    type TUserFavouriteTagS,
    tUserFavouriteTag,
    tUserFavouriteTagPK,
    tUserFavouriteTagTimestampExclude,
} from "~/db/schema/user.favouriteTag";

/** Per-row record returned in sync responses (only the fields the wire needs) */
export type FavouriteTagRecord = Pick<
    TUserFavouriteTagS,
    "tagType" | "tag" | "favourited" | "updatedAt"
>;

/** Per-row payload for upsert from client */
export type FavouriteTagUpsert = Pick<
    TUserFavouriteTagI,
    "tagType" | "tag" | "favourited" | "updatedAt"
>;

/** Result of LWW-merging a single incoming favourite-tag row */
export type FavouriteTagSyncResult = {
    tagType: number;
    tag: string;
    status: "accepted" | "ignored";
};

/**
 * Pure helper: decide which incoming favourite-tag rows win LWW against the
 * currently-stored timestamps, and return the per-row sync results plus the
 * rows that need to be upserted.
 *
 * Server wins on equal timestamps (client must be strictly newer).
 *
 * Exported for unit testing; the route uses it via `batchUpsertFavouriteTags`.
 */
export function resolveFavouriteTagMerge(
    items: FavouriteTagUpsert[],
    existing: Map<string, Date>,
): {
    toUpsert: FavouriteTagUpsert[];
    results: FavouriteTagSyncResult[];
} {
    const toUpsert: FavouriteTagUpsert[] = [];
    const results: FavouriteTagSyncResult[] = [];

    for (const item of items) {
        const key = `${item.tagType}\t${item.tag}`;
        const existingTs = existing.get(key);

        if (existingTs && existingTs >= item.updatedAt) {
            results.push({
                tagType: item.tagType,
                tag: item.tag,
                status: "ignored",
            });
        } else {
            toUpsert.push(item);
            results.push({
                tagType: item.tagType,
                tag: item.tag,
                status: "accepted",
            });
        }
    }

    return { toUpsert, results };
}

/**
 * Fetch the user's favourite tag rows that have changed since `since`.
 *
 * - `since = null` returns only currently-favourited rows (a "live snapshot" — tombstones
 *   from prior unfavourites are omitted, since a fresh client has no state to reconcile
 *   against).
 * - `since != null` returns all rows updated after that timestamp, including tombstones
 *   (`favourited = false`), so other devices can converge.
 */
export async function getFavouriteTagsSince(
    db: TDatabase,
    userId: string,
    since: Date | null,
): Promise<FavouriteTagRecord[]> {
    const where = since
        ? and(
              eq(tUserFavouriteTag.userId, userId),
              gt(tUserFavouriteTag.updatedAt, since),
          )
        : and(
              eq(tUserFavouriteTag.userId, userId),
              eq(tUserFavouriteTag.favourited, true),
          );

    const rows = await db
        .select({
            tagType: tUserFavouriteTag.tagType,
            tag: tUserFavouriteTag.tag,
            favourited: tUserFavouriteTag.favourited,
            updatedAt: tUserFavouriteTag.updatedAt,
        })
        .from(tUserFavouriteTag)
        .where(where);

    return rows;
}

/**
 * LWW-merge a batch of incoming favourite-tag rows.
 *
 * For each incoming row:
 * - If no server row exists, insert it (always accepted).
 * - If a server row exists and the incoming `updatedAt` is strictly greater, overwrite it.
 * - Otherwise, ignore the incoming row.
 *
 * Returns a per-row status for the client.
 */
export async function batchUpsertFavouriteTags(
    db: TDatabase,
    userId: string,
    items: FavouriteTagUpsert[],
): Promise<FavouriteTagSyncResult[]> {
    if (items.length === 0) return [];

    // Pre-fetch existing rows for the touched tag types. Tag-level matching
    // happens in memory below — composite (tagType, tag) filtering would need an
    // OR-of-ANDs that doesn't index any better than a tagType scan via the PK.
    const tagTypes = [...new Set(items.map((i) => i.tagType))];
    const existing = await db
        .select({
            tagType: tUserFavouriteTag.tagType,
            tag: tUserFavouriteTag.tag,
            updatedAt: tUserFavouriteTag.updatedAt,
        })
        .from(tUserFavouriteTag)
        .where(
            and(
                eq(tUserFavouriteTag.userId, userId),
                inArray(tUserFavouriteTag.tagType, tagTypes),
            ),
        );

    const incomingKeys = new Set(items.map((i) => `${i.tagType}\t${i.tag}`));
    const existingByKey = new Map<string, Date>();
    for (const row of existing) {
        const key = `${row.tagType}\t${row.tag}`;
        if (incomingKeys.has(key)) existingByKey.set(key, row.updatedAt);
    }

    const { toUpsert, results } = resolveFavouriteTagMerge(items, existingByKey);

    if (toUpsert.length > 0) {
        const rows: TUserFavouriteTagI[] = toUpsert.map((u) => ({
            userId,
            tagType: u.tagType,
            tag: u.tag,
            favourited: u.favourited,
            updatedAt: u.updatedAt,
        }));
        await db
            .insert(tUserFavouriteTag)
            .values(rows)
            .onDuplicateKeyUpdate(
                onDuplicateKeyUpdateConfig(tUserFavouriteTag, {
                    exclude: [
                        ...tUserFavouriteTagPK,
                        ...tUserFavouriteTagTimestampExclude,
                    ],
                }),
            );
    }

    return results;
}
