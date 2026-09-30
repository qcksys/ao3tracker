import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
  or,
  sql,
} from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { TDatabase } from "~/db/db.client";
import type { TAllTimestampColNames } from "~/db/helpers/schema";
import { incoming, replaceWhen, replaceWhenNewer, sameDate } from "~/db/helpers/sync";
import { type TTrackChapterI, type TTrackChapterS, tTrackChapter } from "~/db/schema/track.chapter";
import { type TTrackWorkI, type TTrackWorkS, tTrackWork } from "~/db/schema/track.work";
import { type TWorkS, tWork } from "~/db/schema/work";
import { type TWorkChapterS, tWorkChapter } from "~/db/schema/work.chapter";
import { type TWorkTagS, tWorkTag } from "~/db/schema/work.tag";
import { tWorkTagLink } from "~/db/schema/work.tag.link";

/** Default page size for sync queries */
export const DEFAULT_SYNC_LIMIT = 50;

// PlanetScale autocommit queries can run for 900 seconds. Replay an extra minute
// because CURRENT_TIMESTAMP records statement start, not the eventual commit.
const SYNC_REPLAY_WINDOW_SECONDS = 16 * 60;

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
  "workId" | "chapterId" | "lastReadAt" | "markedCompleteAt" | "readProgress" | "rowDeletedAt"
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
export type WorkMetadata = Omit<TWorkS, "lastRefreshed" | TAllTimestampColNames>;

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
export async function getLatestWorkLastReadAt(db: TDatabase, userId: string): Promise<Date | null> {
  const result = await db
    .select({ maxLastReadAt: max(tTrackWork.lastReadAt) })
    .from(tTrackWork)
    .where(eq(tTrackWork.userId, userId));

  return result[0]?.maxLastReadAt ?? null;
}

/**
 * Capture a conservative database watermark before reading a sync page. Client
 * event times resolve conflicts; they never determine the ingestion cursor.
 */
export async function getServerLastUpdated(db: TDatabase): Promise<Date> {
  const result = await db.execute(
    sql`SELECT DATE_FORMAT(DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL ${SYNC_REPLAY_WINDOW_SECONDS} SECOND), '%Y-%m-%dT%H:%i:%s.%fZ') AS watermark`,
  );
  const row = result.rows[0];
  return new Date(String(Array.isArray(row) ? row[0] : row.watermark));
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
 * Includes tombstones so resetting a cursor reconciles existing client state.
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

  const conditions = and(
    eq(tTrackWork.userId, userId),
    filterCondition,
    since
      ? or(
          gte(tTrackWork.rowUpdatedAt, since),
          exists(
            db
              .select({ id: tTrackChapter.chapterId })
              .from(tTrackChapter)
              .where(
                and(
                  eq(tTrackChapter.userId, userId),
                  eq(tTrackChapter.workId, tTrackWork.workId),
                  gte(tTrackChapter.rowUpdatedAt, since),
                ),
              ),
          ),
          exists(
            db
              .select({ id: tWork.id })
              .from(tWork)
              .where(and(eq(tWork.id, tTrackWork.workId), gte(tWork.rowUpdatedAt, since))),
          ),
          exists(
            db
              .select({ id: tWorkChapter.id })
              .from(tWorkChapter)
              .where(
                and(
                  eq(tWorkChapter.workId, tTrackWork.workId),
                  gte(tWorkChapter.rowUpdatedAt, since),
                ),
              ),
          ),
        )
      : undefined,
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
async function getWorkMetadataForIds(db: TDatabase, workIds: number[]): Promise<WorkMetadata[]> {
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
    .where(and(inArray(tWorkChapter.workId, workIds), isNull(tWorkChapter.rowDeletedAt)));
}

/** Max tags per sync page (50 works × 200 tags/work) */
const MAX_TAGS_PER_SYNC = 10000;

/**
 * Get tag metadata for a list of work IDs
 */
async function getTagMetadataForWorkIds(db: TDatabase, workIds: number[]): Promise<TagMetadata[]> {
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
): Promise<TrackChapterData[]> {
  if (workIds.length === 0) return [];

  const conditions = and(eq(tTrackChapter.userId, userId), inArray(tTrackChapter.workId, workIds));

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
  const { since, workCursor, limit = DEFAULT_SYNC_LIMIT, filter } = options ?? {};

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
  const [chapters, workMetadata, chapterMetadata, tagMetadata] = await Promise.all([
    getTrackedChaptersForWorkIds(db, userId, allWorkIds),
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

export type WorkSyncResult = {
  workId: number;
  status: "accepted" | "ignored" | "deleted";
};

export type ChapterSyncResult = {
  workId: number;
  chapterId: number;
  status: "accepted" | "ignored";
};

export async function batchProcessWorks(
  db: TDatabase,
  userId: string,
  works: Array<TrackWorkUpsert & { deleted?: boolean }>,
): Promise<WorkSyncResult[]> {
  if (works.length === 0) return [];

  const newerRead = gt(incoming(tTrackWork.lastReadAt), tTrackWork.lastReadAt);
  const live = sql`${and(
    isNull(incoming(tTrackWork.rowDeletedAt)),
    or(isNull(tTrackWork.rowDeletedAt), newerRead),
  )}`;
  const readingWins = sql`${and(live, newerRead)}`;
  const newerField = (timestamp: AnyMySqlColumn) =>
    sql`${and(
      live,
      or(
        and(isNotNull(incoming(timestamp)), isNull(timestamp)),
        gt(incoming(timestamp), timestamp),
        and(isNull(incoming(timestamp)), isNull(timestamp), newerRead),
      ),
    )}`;
  const subscribedWins = newerField(tTrackWork.subscribedUpdatedAt);
  const favouriteWins = newerField(tTrackWork.favouriteUpdatedAt);
  const rows = works.map((work) => ({
    userId,
    workId: work.workId,
    lastReadAt: work.lastReadAt,
    markedCompleteAt: work.markedCompleteAt ?? null,
    private: work.private ?? false,
    subscribed: work.subscribed ?? true,
    favourite: work.favourite ?? false,
    subscribedUpdatedAt: work.subscribedUpdatedAt ?? null,
    favouriteUpdatedAt: work.favouriteUpdatedAt ?? null,
    rowDeletedAt: work.deleted ? work.lastReadAt : null,
  }));

  await db
    .insert(tTrackWork)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: {
        markedCompleteAt: replaceWhen(tTrackWork.markedCompleteAt, readingWins),
        private: replaceWhen(tTrackWork.private, readingWins),
        subscribed: replaceWhen(tTrackWork.subscribed, subscribedWins),
        favourite: replaceWhen(tTrackWork.favourite, favouriteWins),
        subscribedUpdatedAt: sql`IF(${subscribedWins}, COALESCE(${incoming(tTrackWork.subscribedUpdatedAt)}, ${incoming(tTrackWork.lastReadAt)}), ${tTrackWork.subscribedUpdatedAt})`,
        favouriteUpdatedAt: sql`IF(${favouriteWins}, COALESCE(${incoming(tTrackWork.favouriteUpdatedAt)}, ${incoming(tTrackWork.lastReadAt)}), ${tTrackWork.favouriteUpdatedAt})`,
        rowDeletedAt: replaceWhen(tTrackWork.rowDeletedAt, newerRead),
        lastReadAt: replaceWhen(tTrackWork.lastReadAt, newerRead),
      },
    });

  const stored = await db
    .select()
    .from(tTrackWork)
    .where(
      and(
        eq(tTrackWork.userId, userId),
        inArray(
          tTrackWork.workId,
          rows.map((row) => row.workId),
        ),
      ),
    );
  const byId = new Map(stored.map((row) => [row.workId, row]));
  return rows.map((row) => {
    const current = byId.get(row.workId);
    if (!current) return { workId: row.workId, status: "ignored" };
    if (row.rowDeletedAt) {
      return {
        workId: row.workId,
        status: sameDate(current.rowDeletedAt, row.rowDeletedAt) ? "deleted" : "ignored",
      };
    }
    const readingMatches =
      sameDate(current.lastReadAt, row.lastReadAt) &&
      sameDate(current.markedCompleteAt, row.markedCompleteAt) &&
      current.private === row.private;
    const subscribedMatches =
      current.subscribed === row.subscribed &&
      sameDate(
        current.subscribedUpdatedAt ?? current.lastReadAt,
        row.subscribedUpdatedAt ?? row.lastReadAt,
      );
    const favouriteMatches =
      current.favourite === row.favourite &&
      sameDate(
        current.favouriteUpdatedAt ?? current.lastReadAt,
        row.favouriteUpdatedAt ?? row.lastReadAt,
      );
    return {
      workId: row.workId,
      status:
        current.rowDeletedAt === null && (readingMatches || subscribedMatches || favouriteMatches)
          ? "accepted"
          : "ignored",
    };
  });
}

export async function batchProcessChapters(
  db: TDatabase,
  userId: string,
  chapters: Array<TrackChapterUpsert & { deleted?: boolean }>,
): Promise<ChapterSyncResult[]> {
  if (chapters.length === 0) return [];

  const rows = chapters.map((chapter) => ({
    userId,
    workId: chapter.workId,
    chapterId: chapter.chapterId ?? 0,
    lastReadAt: chapter.lastReadAt,
    markedCompleteAt: chapter.markedCompleteAt ?? null,
    readProgress: chapter.readProgress ?? 0,
    rowDeletedAt: chapter.deleted ? chapter.lastReadAt : null,
  }));
  await db
    .insert(tTrackChapter)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: {
        markedCompleteAt: replaceWhenNewer(
          tTrackChapter.markedCompleteAt,
          tTrackChapter.lastReadAt,
        ),
        readProgress: replaceWhenNewer(tTrackChapter.readProgress, tTrackChapter.lastReadAt),
        rowDeletedAt: replaceWhenNewer(tTrackChapter.rowDeletedAt, tTrackChapter.lastReadAt),
        lastReadAt: replaceWhenNewer(tTrackChapter.lastReadAt, tTrackChapter.lastReadAt),
      },
    });

  const stored = await db
    .select()
    .from(tTrackChapter)
    .where(
      and(
        eq(tTrackChapter.userId, userId),
        inArray(
          tTrackChapter.workId,
          rows.map((row) => row.workId),
        ),
      ),
    );
  const byId = new Map(stored.map((row) => [`${row.workId}:${row.chapterId}`, row]));
  return rows.map((row) => {
    const current = byId.get(`${row.workId}:${row.chapterId}`);
    return {
      workId: row.workId,
      chapterId: row.chapterId,
      status:
        current &&
        sameDate(current.rowDeletedAt, row.rowDeletedAt) &&
        sameDate(current.lastReadAt, row.lastReadAt) &&
        sameDate(current.markedCompleteAt, row.markedCompleteAt) &&
        Math.abs(current.readProgress - row.readProgress) < 0.000001
          ? "accepted"
          : "ignored",
    };
  });
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
export async function markWorkAsPrivate(db: TDatabase, workId: number): Promise<void> {
  await db
    .update(tTrackWork)
    .set({ private: true })
    .where(and(eq(tTrackWork.workId, workId), isNull(tTrackWork.rowDeletedAt)));
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
    .where(and(eq(tTrackChapter.workId, workId), eq(tTrackChapter.chapterId, 0)));

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
            markedCompleteAt: zeroRecord.markedCompleteAt ?? existing.markedCompleteAt,
            readProgress: Math.max(zeroRecord.readProgress, existing.readProgress),
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
