/**
 * Shared work fetching logic for scheduled tasks
 */

import type { TDatabase } from "~/db/db.client";
import {
  type ChapterData,
  type TagData,
  upsertWorkChapters,
  upsertWorkTags,
} from "~/db/queries/work";
import {
  fetchChapterIndexHtml,
  fetchWorkHtml,
  NotFoundError,
  RestrictedWorkError,
  sleep,
} from "~/lib/ao3-fetch";
import { parseChapterIndex, parseWorkPage, type WorkInfo, type WorkTags } from "~/lib/ao3-parser";
import {
  collectTags,
  DELAY_BETWEEN_REQUESTS_MS,
  mapChaptersFromDropdown,
  mapChaptersFromIndex,
  mergeChapterData,
  parseAo3Date,
  parseNumber,
  parseTotalChapters,
} from "~/scheduled/helpers";

export { NotFoundError, RestrictedWorkError };

/** Parsed work data ready for database insertion */
export interface ParsedWorkData {
  workInfo: WorkInfo;
  workTags: WorkTags;
  parsed: {
    currentChapters: number;
    totalChapters: number | null;
    lastUpdated: Date | null;
    wordCount: number;
    hits: number;
    kudos: number;
    bookmarks: number;
    comments: number;
  };
  tags: TagData[];
  chapters: ChapterData[];
  /** Whether the chapter index was fetched (has dates) */
  fetchedChapterIndex: boolean;
}

/** Options for fetching work data */
export interface FetchWorkOptions {
  /** Known chapter count from database (skip chapter index if unchanged) */
  knownChapterCount?: number;
}

/**
 * Fetch work data from AO3.
 *
 * Optimized flow:
 * 1. Fetch work page (gets metadata + chapter dropdown with IDs/titles)
 * 2. Only fetch chapter index if there are new chapters (to get dates)
 *
 * @throws {RestrictedWorkError} if the work requires login
 * @throws {NotFoundError} if the work doesn't exist
 */
export async function fetchWorkData(
  workId: number,
  options: FetchWorkOptions = {},
): Promise<ParsedWorkData> {
  const { knownChapterCount } = options;

  // Step 1: Fetch work page (has metadata + chapter dropdown)
  const workHtml = await fetchWorkHtml(workId);
  const { workInfo, workTags, chapters: dropdownChapters } = await parseWorkPage(workHtml);

  // Parse the data
  const { current: currentChapters, total: totalChapters } = parseTotalChapters(
    workInfo.totalChapters,
  );
  const lastUpdated = parseAo3Date(workInfo.workLastUpdated);

  // Collect tags
  const tags = collectTags(workTags);

  // Map chapters from dropdown (no dates)
  const chaptersFromDropdown = mapChaptersFromDropdown(dropdownChapters, workId);

  // Step 2: Only fetch chapter index if there are new chapters
  const hasNewChapters =
    knownChapterCount === undefined || currentChapters > knownChapterCount || currentChapters === 0; // Always fetch for single-chapter works (no dropdown)

  let chapters: ChapterData[];
  let fetchedChapterIndex = false;

  if (hasNewChapters && currentChapters > 0) {
    // Fetch chapter index to get dates for chapters
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
    const chapterIndexHtml = await fetchChapterIndexHtml(workId);
    const chapterIndex = await parseChapterIndex(chapterIndexHtml);
    const chaptersFromIndex = mapChaptersFromIndex(chapterIndex.chapters, workId);

    // Merge: prefer index data (has dates), fallback to dropdown
    chapters = mergeChapterData(chaptersFromDropdown, chaptersFromIndex);
    fetchedChapterIndex = true;

    console.log({
      message: "Fetched chapter index for new chapters",
      workId,
      knownChapterCount,
      currentChapters,
      indexChapters: chaptersFromIndex.length,
    });
  } else {
    // Use dropdown chapters (no dates, but saves a request)
    chapters = chaptersFromDropdown;

    console.log({
      message: "Skipped chapter index (no new chapters)",
      workId,
      knownChapterCount,
      currentChapters,
    });
  }

  return {
    workInfo,
    workTags,
    parsed: {
      currentChapters,
      totalChapters,
      lastUpdated,
      wordCount: parseNumber(workInfo.wordCount),
      hits: parseNumber(workInfo.hits),
      kudos: parseNumber(workInfo.kudos),
      bookmarks: parseNumber(workInfo.bookmarks),
      comments: parseNumber(workInfo.comments),
    },
    tags,
    chapters,
    fetchedChapterIndex,
  };
}

/**
 * Save tags and chapters to the database
 */
export async function saveWorkRelations(
  db: TDatabase,
  workId: number,
  data: ParsedWorkData,
): Promise<void> {
  await upsertWorkTags(db, workId, data.tags);
  await upsertWorkChapters(db, data.chapters);
}

/** Result of processing a single work */
export interface WorkProcessResult {
  workId: number;
  success: boolean;
  restrictedWork?: boolean;
  notFound?: boolean;
  error?: string;
  data?: ParsedWorkData;
}

/**
 * Fetch work data with error handling, returning a result object
 */
export async function fetchWorkDataSafe(
  workId: number,
  options: FetchWorkOptions = {},
): Promise<WorkProcessResult> {
  try {
    const data = await fetchWorkData(workId, options);
    return { workId, success: true, data };
  } catch (error) {
    if (error instanceof RestrictedWorkError) {
      return { workId, success: false, restrictedWork: true };
    }
    if (error instanceof NotFoundError) {
      return { workId, success: false, notFound: true };
    }
    return {
      workId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process a batch of works in parallel
 * @param workIds - Array of work IDs to fetch
 * @param knownChapterCounts - Map of workId to known chapter count (for optimization)
 */
export async function fetchWorksBatch(
  workIds: number[],
  knownChapterCounts?: Map<number, number>,
): Promise<WorkProcessResult[]> {
  return Promise.all(
    workIds.map((workId) =>
      fetchWorkDataSafe(workId, {
        knownChapterCount: knownChapterCounts?.get(workId),
      }),
    ),
  );
}
