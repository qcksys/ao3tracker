import { and, asc, eq, gt, inArray, isNull, max, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import { resolveLWW } from "~/db/helpers/lww";
import type { TAllTimestampColNames } from "~/db/helpers/schema";
import {
    type TTrackChapterI,
    type TTrackChapterS,
    tTrackChapter,
} from "~/db/schema/track.chapter";
import {
    type TTrackWorkI,
    type TTrackWorkS,
    tTrackWork,
} from "~/db/schema/track.work";
import { type TWorkS, tWork } from "~/db/schema/work";
import { type TWorkChapterS, tWorkChapter } from "~/db/schema/work.chapter";
import { type TWorkTagS, tWorkTag } from "~/db/schema/work.tag";
import { tWorkTagLink } from "~/db/schema/work.tag.link";

/** Default page size for sync queries */
export const DEFAULT_SYNC_LIMIT = 50;

// ============================================================================
// Types
// ============================================================================

/** Tracked work data returned in sync responses */
export type TrackWorkData = Pick<
    TTrackWorkS,
    | "workId"
    | "lastReadAt"
    | "markedCompleteAt"
    | "private"
    | "subscribed"
    | "favourite"
    | "subscribedUpdatedAt"
    | "favouriteUpdatedAt"
    | "rowDeletedAt"
>;

/** Tracked chapter data returned in sync responses */
export type TrackChapterData = Pick<
    TTrackChapterS,
    | "workId"
    | "chapterId"
    | "lastReadAt"
    | "markedCompleteAt"
    | "readProgress"
    | "rowDeletedAt"
>;

/** Data for upserting a tracked work (excludes userId, added separately) */
export type TrackWorkUpsert = Pick<
    TTrackWorkI,
    | "workId"
    | "lastReadAt"
    | "markedCompleteAt"
    | "private"
    | "subscribed"
    | "favourite"
    | "subscribedUpdatedAt"
    | "favouriteUpdatedAt"
>;

/** Data for upserting a tracked chapter (excludes userId, added separately) */
export type TrackChapterUpsert = Pick<
    TTrackChapterI,
    "workId" | "chapterId" | "lastReadAt" | "markedCompleteAt" | "readProgress"
>;

/** Work metadata returned in sync responses (excludes internal fields) */
export type WorkMetadata = Omit<
    TWorkS,
    "lastRefreshed" | TAllTimestampColNames
>;

/** Chapter metadata returned in sync responses */
export type ChapterMetadata = Pick<
    TWorkChapterS,
    "id" | "workId" | "number" | "title" | "dateUpdated"
>;

/** Tag metadata returned in sync responses - derived from work tag schema */
export type TagMetadata = Pick<TWorkTagS, "tag" | "href" | "typeId"> & {
    workId: number;
};

/** Filter type for syncing specific works by ID */
export interface WorkIdsFilter {
    type: "workIds";
    workIds: number[];
}

/** Union of all sync filter types - extend as new filter types are added */
export type SyncFilter = WorkIdsFilter;

export interface SyncQueryOptions {
    since?: Date;
    workCursor?: number;
    limit?: number;
    filter?: SyncFilter;
}

export interface SyncResult {
    works: TrackWorkData[];
    chapters: TrackChapterData[];
    workMetadata: WorkMetadata[];
    chapterMetadata: ChapterMetadata[];
    tagMetadata: TagMetadata[];
    hasMoreWorks: boolean;
}

// ============================================================================
// GET /sync Queries
// ============================================================================

/**
 * Get the latest lastReadAt for tracked works only (for client sync filtering)
 */
export async function getLatestWorkLastReadAt(
    db: TDatabase,
    userId: string,
): Promise<Date | null> {
    const result = await db
        .select({ maxLastReadAt: max(tTrackWork.lastReadAt) })
        .from(tTrackWork)
        .where(eq(tTrackWork.userId, userId));

    return result[0]?.maxLastReadAt ?? null;
}

/**
 * Get the server's most recent lastReadAt for a user (for sync reference)
 */
export async function getServerLastUpdated(
    db: TDatabase,
    userId: string,
): Promise<Date | null> {
    // Get max lastReadAt from both works and chapters
    const [workMax, chapterMax] = await Promise.all([
        db
            .select({ maxLastReadAt: max(tTrackWork.lastReadAt) })
            .from(tTrackWork)
            .where(eq(tTrackWork.userId, userId)),
        db
            .select({ maxLastReadAt: max(tTrackChapter.lastReadAt) })
            .from(tTrackChapter)
            .where(eq(tTrackChapter.userId, userId)),
    ]);

    const workDate = workMax[0]?.maxLastReadAt;
    const chapterDate = chapterMax[0]?.maxLastReadAt;

    if (!workDate && !chapterDate) return null;
    if (!workDate) return chapterDate ?? null;
    if (!chapterDate) return workDate;
    return workDate > chapterDate ? workDate : chapterDate;
}

/**
 * Build filter condition based on sync filter type
 */
function buildFilterCondition(filter?: SyncFilter) {
    if (!filter) return undefined;

    switch (filter.type) {
        case "workIds":
            return inArray(tTrackWork.workId, filter.workIds);
        default:
            // TypeScript will error if we miss a case
            return undefined;
    }
}

/**
 * Get tracked works for sync with pagination
 * Includes deleted items if they were updated since the last sync
 */
async function getTrackedWorks(
    db: TDatabase,
    userId: string,
    options: {
        since?: Date;
        cursor?: number;
        limit: number;
        filter?: SyncFilter;
    },
): Promise<{ works: TrackWorkData[]; hasMore: boolean }> {
    const { since, cursor, limit, filter } = options;

    // Build filter condition if present
    const filterCondition = buildFilterCondition(filter);

    // For sync, we need to include deleted items if they were deleted since last sync
    const conditions = and(
        eq(tTrackWork.userId, userId),
        filterCondition,
        since
            ? or(
                  // Include items updated since last sync (not deleted)
                  and(
                      gt(tTrackWork.lastReadAt, since),
                      isNull(tTrackWork.rowDeletedAt),
                  ),
                  // Include items deleted since last sync
                  and(gt(tTrackWork.rowDeletedAt, since)),
              )
            : isNull(tTrackWork.rowDeletedAt), // Full sync: only non-deleted
        cursor ? gt(tTrackWork.workId, cursor) : undefined,
    );

    const results = await db
        .select({
            workId: tTrackWork.workId,
            lastReadAt: tTrackWork.lastReadAt,
            markedCompleteAt: tTrackWork.markedCompleteAt,
            private: tTrackWork.private,
            subscribed: tTrackWork.subscribed,
            favourite: tTrackWork.favourite,
            subscribedUpdatedAt: tTrackWork.subscribedUpdatedAt,
            favouriteUpdatedAt: tTrackWork.favouriteUpdatedAt,
            rowDeletedAt: tTrackWork.rowDeletedAt,
        })
        .from(tTrackWork)
        .where(conditions)
        .orderBy(asc(tTrackWork.workId))
        .limit(limit + 1);

    const hasMore = results.length > limit;
    const works = hasMore ? results.slice(0, limit) : results;

    return { works, hasMore };
}

/**
 * Get work metadata for a list of work IDs
 */
async function getWorkMetadataForIds(
    db: TDatabase,
    workIds: number[],
): Promise<WorkMetadata[]> {
    if (workIds.length === 0) return [];

    return db
        .select({
            id: tWork.id,
            title: tWork.title,
            author: tWork.author,
            authorUrl: tWork.authorUrl,
            summary: tWork.summary,
            language: tWork.language,
            wordCount: tWork.wordCount,
            currentChapters: tWork.currentChapters,
            totalChapters: tWork.totalChapters,
            hits: tWork.hits,
            kudos: tWork.kudos,
            bookmarks: tWork.bookmarks,
            comments: tWork.comments,
            published: tWork.published,
            lastUpdated: tWork.lastUpdated,
            downloadPath: tWork.downloadPath,
            downloadUpdatedAt: tWork.downloadUpdatedAt,
        })
        .from(tWork)
        .where(and(inArray(tWork.id, workIds), isNull(tWork.rowDeletedAt)));
}

/**
 * Get chapter metadata for a list of work IDs
 */
async function getChapterMetadataForWorkIds(
    db: TDatabase,
    workIds: number[],
): Promise<ChapterMetadata[]> {
    if (workIds.length === 0) return [];

    return db
        .select({
            id: tWorkChapter.id,
            workId: tWorkChapter.workId,
            number: tWorkChapter.number,
            title: tWorkChapter.title,
            dateUpdated: tWorkChapter.dateUpdated,
        })
        .from(tWorkChapter)
        .where(
            and(
                inArray(tWorkChapter.workId, workIds),
                isNull(tWorkChapter.rowDeletedAt),
            ),
        );
}

/** Max tags per sync page (50 works × 200 tags/work) */
const MAX_TAGS_PER_SYNC = 10000;

/**
 * Get tag metadata for a list of work IDs
 */
async function getTagMetadataForWorkIds(
    db: TDatabase,
    workIds: number[],
): Promise<TagMetadata[]> {
    if (workIds.length === 0) return [];

    return db
        .select({
            workId: tWorkTagLink.work,
            tag: tWorkTag.tag,
            href: tWorkTag.href,
            typeId: tWorkTag.typeId,
        })
        .from(tWorkTagLink)
        .innerJoin(tWorkTag, eq(tWorkTagLink.tag, tWorkTag.id))
        .where(inArray(tWorkTagLink.work, workIds))
        .limit(MAX_TAGS_PER_SYNC);
}

/**
 * Get all tracked chapters for specific work IDs (for a specific user)
 * This is used to fetch all chapters for works returned in sync
 */
async function getTrackedChaptersForWorkIds(
    db: TDatabase,
    userId: string,
    workIds: number[],
    since?: Date,
): Promise<TrackChapterData[]> {
    if (workIds.length === 0) return [];

    const conditions = and(
        eq(tTrackChapter.userId, userId),
        inArray(tTrackChapter.workId, workIds),
        since
            ? or(
                  and(
                      gt(tTrackChapter.lastReadAt, since),
                      isNull(tTrackChapter.rowDeletedAt),
                  ),
                  and(gt(tTrackChapter.rowDeletedAt, since)),
              )
            : isNull(tTrackChapter.rowDeletedAt),
    );

    return db
        .select({
            workId: tTrackChapter.workId,
            chapterId: tTrackChapter.chapterId,
            lastReadAt: tTrackChapter.lastReadAt,
            markedCompleteAt: tTrackChapter.markedCompleteAt,
            readProgress: tTrackChapter.readProgress,
            rowDeletedAt: tTrackChapter.rowDeletedAt,
        })
        .from(tTrackChapter)
        .where(conditions)
        .orderBy(asc(tTrackChapter.workId), asc(tTrackChapter.chapterId));
}

/**
 * Get tracked works and chapters for sync with metadata
 * Pagination is only on works - all chapters for returned works are included
 */
export async function getTrackedWorksForSync(
    db: TDatabase,
    userId: string,
    options?: SyncQueryOptions,
): Promise<SyncResult> {
    const {
        since,
        workCursor,
        limit = DEFAULT_SYNC_LIMIT,
        filter,
    } = options ?? {};

    // Get paginated works
    const worksResult = await getTrackedWorks(db, userId, {
        since,
        cursor: workCursor,
        limit,
        filter,
    });

    // Get all work IDs from this page (including deleted ones for chapter tracking)
    const allWorkIds = worksResult.works.map((w) => w.workId);

    // Get non-deleted, non-private work IDs for metadata fetch
    // Private works require AO3 login so we don't have metadata for them
    const activeWorkIds = worksResult.works
        .filter((w) => w.rowDeletedAt === null && !w.private)
        .map((w) => w.workId);

    // Get tracked chapters for these works (all chapters, no pagination)
    // and metadata in parallel
    const [chapters, workMetadata, chapterMetadata, tagMetadata] =
        await Promise.all([
            getTrackedChaptersForWorkIds(db, userId, allWorkIds, since),
            getWorkMetadataForIds(db, activeWorkIds),
            getChapterMetadataForWorkIds(db, activeWorkIds),
            getTagMetadataForWorkIds(db, activeWorkIds),
        ]);

    return {
        works: worksResult.works,
        chapters,
        workMetadata,
        chapterMetadata,
        tagMetadata,
        hasMoreWorks: worksResult.hasMore,
    };
}

// ============================================================================
// POST /sync Queries - Conflict Resolution
// ============================================================================

/** Server state for a tracked work (for per-field conflict resolution) */
interface WorkServerState {
    lastReadAt: Date;
    subscribed: boolean;
    subscribedUpdatedAt: Date | null;
    favourite: boolean;
    favouriteUpdatedAt: Date | null;
}

/**
 * Get the current state for multiple tracked works in a single query
 * Returns a Map of workId -> WorkServerState (only includes existing non-deleted works)
 */
async function getWorksCurrentState(
    db: TDatabase,
    userId: string,
    workIds: number[],
): Promise<Map<number, WorkServerState>> {
    if (workIds.length === 0) return new Map();

    const results = await db
        .select({
            workId: tTrackWork.workId,
            lastReadAt: tTrackWork.lastReadAt,
            subscribed: tTrackWork.subscribed,
            subscribedUpdatedAt: tTrackWork.subscribedUpdatedAt,
            favourite: tTrackWork.favourite,
            favouriteUpdatedAt: tTrackWork.favouriteUpdatedAt,
        })
        .from(tTrackWork)
        .where(
            and(
                eq(tTrackWork.userId, userId),
                inArray(tTrackWork.workId, workIds),
                isNull(tTrackWork.rowDeletedAt),
            ),
        );

    return new Map(
        results.map((r) => [
            r.workId,
            {
                lastReadAt: r.lastReadAt,
                subscribed: r.subscribed,
                subscribedUpdatedAt: r.subscribedUpdatedAt,
                favourite: r.favourite,
                favouriteUpdatedAt: r.favouriteUpdatedAt,
            },
        ]),
    );
}

/**
 * Get the current lastReadAt for multiple tracked chapters in a single query
 * Returns a Map of "workId:chapterId" -> lastReadAt (only includes existing non-deleted chapters)
 */
async function getChaptersLastReadAt(
    db: TDatabase,
    userId: string,
    chapters: Array<{ workId: number; chapterId: number }>,
): Promise<Map<string, Date>> {
    if (chapters.length === 0) return new Map();

    // Build conditions for each chapter
    const workIds = [...new Set(chapters.map((c) => c.workId))];

    const results = await db
        .select({
            workId: tTrackChapter.workId,
            chapterId: tTrackChapter.chapterId,
            lastReadAt: tTrackChapter.lastReadAt,
        })
        .from(tTrackChapter)
        .where(
            and(
                eq(tTrackChapter.userId, userId),
                inArray(tTrackChapter.workId, workIds),
                isNull(tTrackChapter.rowDeletedAt),
            ),
        );

    // Filter to only the chapters we care about
    const chapterKeys = new Set(
        chapters.map((c) => `${c.workId}:${c.chapterId}`),
    );
    return new Map(
        results
            .filter((r) => chapterKeys.has(`${r.workId}:${r.chapterId}`))
            .map((r) => [`${r.workId}:${r.chapterId}`, r.lastReadAt]),
    );
}

// ============================================================================
// POST /sync Batch Processing
// ============================================================================

/** Result of a work sync operation */
export type WorkSyncResult = {
    workId: number;
    status: "accepted" | "ignored" | "deleted";
};

/** Result of a chapter sync operation */
export type ChapterSyncResult = {
    workId: number;
    chapterId: number;
    status: "accepted" | "ignored";
};

/**
 * Process multiple work upserts/deletes with per-field conflict resolution
 *
 * Uses Last-Write-Wins (LWW) for each field independently:
 * - lastReadAt, markedCompleteAt, private: compared using lastReadAt
 * - subscribed: compared using subscribedUpdatedAt (fallback to lastReadAt)
 * - favourite: compared using favouriteUpdatedAt (fallback to lastReadAt)
 *
 * Server wins on tie (client must be strictly newer to win).
 */
export async function batchProcessWorks(
    db: TDatabase,
    userId: string,
    works: Array<TrackWorkUpsert & { deleted?: boolean }>,
): Promise<WorkSyncResult[]> {
    if (works.length === 0) return [];

    // Get all server state in one query
    const workIds = works.map((w) => w.workId);
    const serverStates = await getWorksCurrentState(db, userId, workIds);

    const results: WorkSyncResult[] = [];
    const toInsert: Array<TTrackWorkI> = [];
    const toUpdate: Array<{
        workId: number;
        updates: Partial<TTrackWorkI>;
    }> = [];
    const toDelete: Array<{ workId: number; lastReadAt: Date }> = [];

    for (const work of works) {
        const serverState = serverStates.get(work.workId);

        if (work.deleted) {
            // For deletes, compare using lastReadAt
            if (serverState && serverState.lastReadAt > work.lastReadAt) {
                results.push({ workId: work.workId, status: "ignored" });
            } else {
                toDelete.push({
                    workId: work.workId,
                    lastReadAt: work.lastReadAt,
                });
                results.push({ workId: work.workId, status: "deleted" });
            }
            continue;
        }

        if (!serverState) {
            // New work - insert all fields
            toInsert.push({
                userId,
                workId: work.workId,
                lastReadAt: work.lastReadAt,
                markedCompleteAt: work.markedCompleteAt ?? null,
                private: work.private,
                subscribed: work.subscribed,
                favourite: work.favourite,
                subscribedUpdatedAt: work.subscribedUpdatedAt ?? null,
                favouriteUpdatedAt: work.favouriteUpdatedAt ?? null,
            });
            results.push({ workId: work.workId, status: "accepted" });
            continue;
        }

        // Existing work - per-field conflict resolution
        const updates: Partial<TTrackWorkI> = {};
        let hasAcceptedChanges = false;

        // 1. lastReadAt, markedCompleteAt, private - use lastReadAt for comparison
        if (work.lastReadAt > serverState.lastReadAt) {
            updates.lastReadAt = work.lastReadAt;
            updates.markedCompleteAt = work.markedCompleteAt ?? null;
            updates.private = work.private;
            hasAcceptedChanges = true;
        }

        // 2. subscribed - use subscribedUpdatedAt (fallback to lastReadAt)
        const subscribedResult = resolveLWW(
            {
                value: work.subscribed,
                updatedAt: work.subscribedUpdatedAt ?? null,
                fallbackTs: work.lastReadAt,
            },
            {
                value: serverState.subscribed,
                updatedAt: serverState.subscribedUpdatedAt,
                fallbackTs: serverState.lastReadAt,
            },
        );
        if (subscribedResult.shouldUpdate) {
            updates.subscribed = subscribedResult.value;
            updates.subscribedUpdatedAt = subscribedResult.updatedAt;
            hasAcceptedChanges = true;
        }

        // 3. favourite - use favouriteUpdatedAt (fallback to lastReadAt)
        const favouriteResult = resolveLWW(
            {
                value: work.favourite,
                updatedAt: work.favouriteUpdatedAt ?? null,
                fallbackTs: work.lastReadAt,
            },
            {
                value: serverState.favourite,
                updatedAt: serverState.favouriteUpdatedAt,
                fallbackTs: serverState.lastReadAt,
            },
        );
        if (favouriteResult.shouldUpdate) {
            updates.favourite = favouriteResult.value;
            updates.favouriteUpdatedAt = favouriteResult.updatedAt;
            hasAcceptedChanges = true;
        }

        if (hasAcceptedChanges) {
            toUpdate.push({ workId: work.workId, updates });
            results.push({ workId: work.workId, status: "accepted" });
        } else {
            results.push({ workId: work.workId, status: "ignored" });
        }
    }

    // Insert new works (batch)
    if (toInsert.length > 0) {
        await db
            .insert(tTrackWork)
            .values(toInsert)
            .onDuplicateKeyUpdate({
                set: {
                    lastReadAt: sql`VALUES(${tTrackWork.lastReadAt})`,
                    markedCompleteAt: sql`VALUES(${tTrackWork.markedCompleteAt})`,
                    private: sql`VALUES(${tTrackWork.private})`,
                    subscribed: sql`VALUES(${tTrackWork.subscribed})`,
                    favourite: sql`VALUES(${tTrackWork.favourite})`,
                    subscribedUpdatedAt: sql`VALUES(${tTrackWork.subscribedUpdatedAt})`,
                    favouriteUpdatedAt: sql`VALUES(${tTrackWork.favouriteUpdatedAt})`,
                    rowDeletedAt: null,
                },
            });
    }

    // Update existing works (individual updates due to per-field resolution)
    for (const { workId, updates } of toUpdate) {
        await db
            .update(tTrackWork)
            .set(updates)
            .where(
                and(
                    eq(tTrackWork.userId, userId),
                    eq(tTrackWork.workId, workId),
                ),
            );
    }

    // Process deletes
    for (const del of toDelete) {
        await db
            .update(tTrackWork)
            .set({
                rowDeletedAt: del.lastReadAt,
                lastReadAt: del.lastReadAt,
            })
            .where(
                and(
                    eq(tTrackWork.userId, userId),
                    eq(tTrackWork.workId, del.workId),
                    isNull(tTrackWork.rowDeletedAt),
                ),
            );
    }

    return results;
}

/**
 * Process multiple chapter upserts in batch
 * 1. Fetches all server lastReadAt values in one query
 * 2. Filters to only items where client is newer
 * 3. Performs batch upsert
 * 4. Returns status for each item
 */
export async function batchProcessChapters(
    db: TDatabase,
    userId: string,
    chapters: TrackChapterUpsert[],
): Promise<ChapterSyncResult[]> {
    if (chapters.length === 0) return [];

    // Normalize chapterIds (use 0 for single-chapter works)
    const normalizedChapters = chapters.map((c) => ({
        ...c,
        chapterId: c.chapterId ?? 0,
    }));

    // Get all server timestamps in one query
    const serverTimestamps = await getChaptersLastReadAt(
        db,
        userId,
        normalizedChapters.map((c) => ({
            workId: c.workId,
            chapterId: c.chapterId,
        })),
    );

    const results: ChapterSyncResult[] = [];
    const toUpsert: Array<{
        userId: string;
        workId: number;
        chapterId: number;
        lastReadAt: Date;
        markedCompleteAt: Date | null;
        readProgress: number;
    }> = [];

    // Categorize each chapter
    for (const chapter of normalizedChapters) {
        const key = `${chapter.workId}:${chapter.chapterId}`;
        const serverLastReadAt = serverTimestamps.get(key);

        // For upserts, check if server is newer or equal
        if (serverLastReadAt && serverLastReadAt >= chapter.lastReadAt) {
            results.push({
                workId: chapter.workId,
                chapterId: chapter.chapterId,
                status: "ignored",
            });
        } else {
            toUpsert.push({
                userId,
                workId: chapter.workId,
                chapterId: chapter.chapterId,
                lastReadAt: chapter.lastReadAt,
                markedCompleteAt: chapter.markedCompleteAt ?? null,
                readProgress: chapter.readProgress ?? 0,
            });
            results.push({
                workId: chapter.workId,
                chapterId: chapter.chapterId,
                status: "accepted",
            });
        }
    }

    // Batch upsert chapters
    if (toUpsert.length > 0) {
        await db
            .insert(tTrackChapter)
            .values(toUpsert)
            .onDuplicateKeyUpdate({
                set: {
                    lastReadAt: sql`VALUES(${tTrackChapter.lastReadAt})`,
                    markedCompleteAt: sql`VALUES(${tTrackChapter.markedCompleteAt})`,
                    readProgress: sql`VALUES(${tTrackChapter.readProgress})`,
                    rowDeletedAt: null, // Undelete if previously deleted
                },
            });
    }

    return results;
}

// ============================================================================
// Utility Queries
// ============================================================================

/**
 * Check if a user is tracking a specific work
 */
export async function isUserTrackingWork(
    db: TDatabase,
    userId: string,
    workId: number,
): Promise<boolean> {
    const result = await db
        .select({ count: sql<number>`1` })
        .from(tTrackWork)
        .where(
            and(
                eq(tTrackWork.userId, userId),
                eq(tTrackWork.workId, workId),
                isNull(tTrackWork.rowDeletedAt),
            ),
        )
        .limit(1);

    return result.length > 0;
}

/**
 * Mark all tracked instances of a work as private (requires AO3 login)
 * Used by scheduled tasks when detecting restricted works
 */
export async function markWorkAsPrivate(
    db: TDatabase,
    workId: number,
): Promise<void> {
    await db
        .update(tTrackWork)
        .set({ private: true })
        .where(
            and(eq(tTrackWork.workId, workId), isNull(tTrackWork.rowDeletedAt)),
        );
}

/**
 * Migrate single-chapter tracking records (chapterId=0) to actual chapter IDs.
 * Called when a work gains additional chapters (goes from 1 to 2+ chapters).
 *
 * Handles the case where a user has both chapterId=0 and the actual firstChapterId:
 * - Keeps the record with the newer lastReadAt
 * - Deletes the other record
 *
 * @returns Number of records migrated or merged
 */
export async function migrateSingleChapterTracking(
    db: TDatabase,
    workId: number,
    firstChapterId: number,
): Promise<number> {
    // Find all chapterId=0 records for this work
    const zeroRecords = await db
        .select()
        .from(tTrackChapter)
        .where(
            and(
                eq(tTrackChapter.workId, workId),
                eq(tTrackChapter.chapterId, 0),
            ),
        );

    if (zeroRecords.length === 0) {
        return 0;
    }

    let migratedCount = 0;

    for (const zeroRecord of zeroRecords) {
        // Check if user already has a record with the actual chapter ID
        const existingRecord = await db
            .select()
            .from(tTrackChapter)
            .where(
                and(
                    eq(tTrackChapter.userId, zeroRecord.userId),
                    eq(tTrackChapter.workId, workId),
                    eq(tTrackChapter.chapterId, firstChapterId),
                ),
            )
            .limit(1);

        if (existingRecord.length > 0) {
            // User has both records - keep the one with newer lastReadAt
            const existing = existingRecord[0];
            const keepZero = zeroRecord.lastReadAt > existing.lastReadAt;

            if (keepZero) {
                // Update the existing record with data from zeroRecord, then delete zeroRecord
                await db
                    .update(tTrackChapter)
                    .set({
                        lastReadAt: zeroRecord.lastReadAt,
                        markedCompleteAt:
                            zeroRecord.markedCompleteAt ??
                            existing.markedCompleteAt,
                        readProgress: Math.max(
                            zeroRecord.readProgress,
                            existing.readProgress,
                        ),
                    })
                    .where(
                        and(
                            eq(tTrackChapter.userId, zeroRecord.userId),
                            eq(tTrackChapter.workId, workId),
                            eq(tTrackChapter.chapterId, firstChapterId),
                        ),
                    );
            }
            // Delete the chapterId=0 record
            await db
                .delete(tTrackChapter)
                .where(
                    and(
                        eq(tTrackChapter.userId, zeroRecord.userId),
                        eq(tTrackChapter.workId, workId),
                        eq(tTrackChapter.chapterId, 0),
                    ),
                );
        } else {
            // No existing record - simply update chapterId from 0 to actual ID
            await db
                .update(tTrackChapter)
                .set({ chapterId: firstChapterId })
                .where(
                    and(
                        eq(tTrackChapter.userId, zeroRecord.userId),
                        eq(tTrackChapter.workId, workId),
                        eq(tTrackChapter.chapterId, 0),
                    ),
                );
        }
        migratedCount++;
    }

    return migratedCount;
}
