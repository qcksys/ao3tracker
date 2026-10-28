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
  isAo3Unavailable,
  NotFoundError,
  RestrictedWorkError,
  sleep,
  UnrevealedWorkError,
} from "~/lib/ao3-fetch";
import {
  isUnrevealedWorkPage,
  parseChapterIndex,
  parseWorkPage,
  type WorkInfo,
  type WorkTags,
} from "~/lib/ao3-parser";
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

export { NotFoundError, RestrictedWorkError, UnrevealedWorkError };

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

/** A parsed work page whose chapters still need the chapter index when it has new chapters */
export interface ParsedWorkPage extends Omit<ParsedWorkData, "chapters" | "fetchedChapterIndex"> {
  chaptersFromDropdown: ChapterData[];
  knownChapterCount: number | undefined;
  /** The page has more chapters than known, so the chapter index is needed for their dates */
  needsChapterIndex: boolean;
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
  const page = await parseWorkPageHtml(workId, await fetchWorkHtml(workId), options);
  if (!page.needsChapterIndex) return completeWorkData(workId, page, null);

  await sleep(DELAY_BETWEEN_REQUESTS_MS);
  return completeWorkData(workId, page, await fetchChapterIndexHtml(workId));
}

/**
 * Parse a work page loaded by any client (the Worker or the browser work checker).
 * @throws {UnrevealedWorkError} if AO3 hides the work until its challenge reveals it
 * @throws if the page is not a work page
 */
export async function parseWorkPageHtml(
  workId: number,
  workHtml: string,
  options: FetchWorkOptions = {},
): Promise<ParsedWorkPage> {
  const { knownChapterCount } = options;
  const { workInfo, workTags, chapters: dropdownChapters } = await parseWorkPage(workHtml);

  // Parse the data
  const { current: currentChapters, total: totalChapters } = parseTotalChapters(
    workInfo.totalChapters,
  );

  // Every work page has a title and at least one chapter. Without them the response was an
  // interstitial or error page served with a success status; saving it would overwrite the work
  // with "Unknown" metadata and zero chapters.
  if (!workInfo.workName || currentChapters < 1) {
    if (await isUnrevealedWorkPage(workHtml)) throw new UnrevealedWorkError(workId);
    throw new Error(
      `Work ${workId} response is not a work page (title: ${workInfo.workName !== null}, chapters: ${JSON.stringify(workInfo.totalChapters)})`,
    );
  }

  const lastUpdated = parseAo3Date(workInfo.workLastUpdated);

  // Collect tags
  const tags = collectTags(workTags);

  return {
    workInfo,
    workTags,
    chaptersFromDropdown: mapChaptersFromDropdown(dropdownChapters, workId),
    knownChapterCount,
    needsChapterIndex: knownChapterCount === undefined || currentChapters > knownChapterCount,
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
  };
}

/**
 * Resolve a parsed work page's chapters, merging in the chapter index when one was loaded.
 * Without it the dropdown chapters are used (no dates, but saves a request).
 */
export async function completeWorkData(
  workId: number,
  page: ParsedWorkPage,
  chapterIndexHtml: string | null,
): Promise<ParsedWorkData> {
  const { chaptersFromDropdown, knownChapterCount } = page;
  const data = {
    workInfo: page.workInfo,
    workTags: page.workTags,
    parsed: page.parsed,
    tags: page.tags,
  };
  const { currentChapters } = data.parsed;

  if (chapterIndexHtml === null) {
    console.log({
      message: "Skipped chapter index (no new chapters)",
      workId,
      knownChapterCount,
      currentChapters,
    });
    return { ...data, chapters: chaptersFromDropdown, fetchedChapterIndex: false };
  }

  const chapterIndex = await parseChapterIndex(chapterIndexHtml);
  const chaptersFromIndex = mapChaptersFromIndex(chapterIndex.chapters, workId);
  console.log({
    message: "Fetched chapter index for new chapters",
    workId,
    knownChapterCount,
    currentChapters,
    indexChapters: chaptersFromIndex.length,
  });

  // Merge: prefer index data (has dates), fallback to dropdown
  return {
    ...data,
    chapters: mergeChapterData(chaptersFromDropdown, chaptersFromIndex),
    fetchedChapterIndex: true,
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
  /** AO3 hides the work until its challenge reveals it; not a failure */
  unrevealed?: boolean;
  /** AO3 itself failed (5xx, 429, timeout or network error), not the work */
  unavailable?: boolean;
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
    if (error instanceof UnrevealedWorkError) {
      return { workId, success: false, unrevealed: true };
    }
    return {
      workId,
      success: false,
      unavailable: isAo3Unavailable(error),
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
