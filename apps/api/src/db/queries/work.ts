import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import type { OmitTimestampCols } from "~/db/helpers/schema";
import { tTrackWork } from "~/db/schema/track.work";
import { type TWorkI, tWork, tWorkTimestampExclude } from "~/db/schema/work";
import {
  type TWorkChapterI,
  tWorkChapter,
  tWorkChapterPK,
  tWorkChapterTimestampExclude,
} from "~/db/schema/work.chapter";
import { type TWorkTagI, tWorkTag, tWorkTagUpsertExclude } from "~/db/schema/work.tag";
import {
  tWorkTagLink,
  tWorkTagLinkPK,
  tWorkTagLinkTimestampExclude,
} from "~/db/schema/work.tag.link";

/** Data for updating a work's metadata (excludes id and audit columns) */
export type WorkUpdateData = OmitTimestampCols<Omit<TWorkI, "id" | "published">>;

/** Data for upserting a tag (excludes auto-increment id) */
export type TagData = Omit<TWorkTagI, "id">;

/** Data for upserting a chapter (all fields required for insert) */
export type ChapterData = Required<
  Pick<TWorkChapterI, "id" | "workId" | "number" | "title" | "dateUpdated">
>;

/**
 * Find works that haven't been refreshed since the given threshold
 */
export async function findStaleWorks(
  db: TDatabase,
  staleThreshold: Date,
  limit: number,
): Promise<{ id: number; currentChapters: number | null }[]> {
  return db
    .select({ id: tWork.id, currentChapters: tWork.currentChapters })
    .from(tWork)
    .where(and(lt(tWork.lastRefreshed, staleThreshold), isNull(tWork.rowDeletedAt)))
    .limit(limit);
}

/**
 * Update a work's metadata and refresh timestamp
 */
export async function updateWork(
  db: TDatabase,
  workId: number,
  data: WorkUpdateData,
): Promise<void> {
  await db
    .update(tWork)
    .set({ ...data, lastRefreshed: new Date() })
    .where(eq(tWork.id, workId));
}

/**
 * Upsert tags and update tag links for a work
 */
export async function upsertWorkTags(
  db: TDatabase,
  workId: number,
  tags: TagData[],
): Promise<void> {
  if (tags.length === 0) {
    await db.delete(tWorkTagLink).where(eq(tWorkTagLink.work, workId));
    await db
      .update(tWork)
      .set({ rowUpdatedAt: sql`CURRENT_TIMESTAMP(3)` })
      .where(eq(tWork.id, workId));
    return;
  }

  // Upsert tags (exclude id and tag since tag is the unique key)
  await db
    .insert(tWorkTag)
    .values(tags)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tWorkTag, {
        exclude: tWorkTagUpsertExclude,
      }),
    );

  // Look up the tag IDs by tag name
  const tagNames = tags.map((t) => t.tag);
  const tagRecords = await db
    .select({ id: tWorkTag.id, tag: tWorkTag.tag })
    .from(tWorkTag)
    .where(inArray(tWorkTag.tag, tagNames));

  // Create a map from tag name to tag ID
  const tagNameToId = new Map(tagRecords.map((r) => [r.tag, r.id]));

  // Build the tag links using the looked-up IDs
  const tagLinks = tags
    .map((t) => {
      const tagId = tagNameToId.get(t.tag);
      if (tagId === undefined) return null;
      return { tag: tagId, work: workId };
    })
    .filter((link): link is { tag: number; work: number } => link !== null);

  // Delete existing tag links that are not in this list of IDS for this work and re-insert
  await db.delete(tWorkTagLink).where(
    and(
      eq(tWorkTagLink.work, workId),
      notInArray(
        tWorkTagLink.tag,
        tagRecords.map((r) => r.id),
      ),
    ),
  );

  if (tagLinks.length > 0) {
    await db
      .insert(tWorkTagLink)
      .values(tagLinks)
      .onDuplicateKeyUpdate(
        onDuplicateKeyUpdateConfig(tWorkTagLink, {
          exclude: tWorkTagLinkTimestampExclude,
          keep: tWorkTagLinkPK,
        }),
      );
  }

  // Tag-link removals have no tombstones; publish the completed replacement
  // through the parent metadata row so incremental sync can discover it.
  await db
    .update(tWork)
    .set({ rowUpdatedAt: sql`CURRENT_TIMESTAMP(3)` })
    .where(eq(tWork.id, workId));
}

/**
 * Upsert chapters for a work
 */
export async function upsertWorkChapters(db: TDatabase, chapters: TWorkChapterI[]): Promise<void> {
  if (chapters.length === 0) return;

  await db
    .insert(tWorkChapter)
    .values(chapters)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tWorkChapter, {
        exclude: [...tWorkChapterPK, ...tWorkChapterTimestampExclude],
      }),
    );
}

/**
 * Find work IDs that are tracked but don't exist in the works table.
 * Excludes private works (those requiring AO3 login).
 */
export async function findMissingTrackedWorks(
  db: TDatabase,
  limit: number,
): Promise<{ workId: number }[]> {
  return db
    .selectDistinct({ workId: tTrackWork.workId })
    .from(tTrackWork)
    .leftJoin(tWork, eq(tTrackWork.workId, tWork.id))
    .where(and(isNull(tWork.id), isNull(tTrackWork.rowDeletedAt), eq(tTrackWork.private, false)))
    .limit(limit);
}

/**
 * Insert or update a work (upsert pattern for idempotent operations)
 */
export async function upsertWork(db: TDatabase, data: TWorkI): Promise<void> {
  await db
    .insert(tWork)
    .values(data)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tWork, {
        exclude: tWorkTimestampExclude,
      }),
    );
}

/**
 * Update only lastRefreshed on a work (used in error paths to prevent immediate re-processing)
 */
export async function touchWorkRefreshed(db: TDatabase, workId: number): Promise<void> {
  await db.update(tWork).set({ lastRefreshed: new Date() }).where(eq(tWork.id, workId));
}

/**
 * Soft-delete a work (marks as deleted but keeps tracking data intact)
 * Used when a work returns 404 from AO3 (deleted from AO3)
 */
export async function softDeleteWork(db: TDatabase, workId: number): Promise<void> {
  await db
    .update(tWork)
    .set({ rowDeletedAt: new Date() })
    .where(and(eq(tWork.id, workId), isNull(tWork.rowDeletedAt)));
}

/**
 * Get the current chapter count for a work
 * Returns null if work doesn't exist
 */
export async function getWorkChapterCount(db: TDatabase, workId: number): Promise<number | null> {
  const result = await db
    .select({ currentChapters: tWork.currentChapters })
    .from(tWork)
    .where(eq(tWork.id, workId))
    .limit(1);

  return result[0]?.currentChapters ?? null;
}

/** Work state data needed for notification comparison */
export interface WorkStateData {
  title: string;
  currentChapters: number;
  totalChapters: number | null;
}

/**
 * Get work state data for notification comparison
 * Returns null if work doesn't exist
 */
export async function getWorkState(db: TDatabase, workId: number): Promise<WorkStateData | null> {
  const result = await db
    .select({
      title: tWork.title,
      currentChapters: tWork.currentChapters,
      totalChapters: tWork.totalChapters,
    })
    .from(tWork)
    .where(eq(tWork.id, workId))
    .limit(1);

  return result[0] ?? null;
}
