/**
 * Shared helpers for scheduled tasks
 */

import type { ChapterData, TagData } from "~/db/queries/work";
import { type TTagTypeId, tagTypes } from "~/db/schema/work.tag";
import type { ChapterDropdownInfo, ChapterInfo, TagInfo } from "~/lib/ao3-parser";

/** Delay between AO3 requests to avoid rate limiting */
export const DELAY_BETWEEN_REQUESTS_MS = 2000;

/**
 * Parse a date string from AO3 (YYYY-MM-DD format)
 */
export function parseAo3Date(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a number string, removing commas
 */
export function parseNumber(numStr: string | null): number {
  if (!numStr) return 0;
  return Number.parseInt(numStr.replace(/,/g, ""), 10) || 0;
}

/**
 * Extract chapter ID from URL like /works/123/chapters/456
 */
export function extractChapterId(url: string | null): number | null {
  if (!url) return null;
  const match = url.match(/\/chapters\/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Extract chapter number from string like "Chapter 1: Title" or "1. Title"
 */
export function extractChapterNumber(chapterStr: string | null): number | null {
  if (!chapterStr) return null;
  // Match "Chapter N" or just "N." at the start
  const match = chapterStr.match(/(?:Chapter\s+)?(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Parse total chapters from string like "5/10" or "5/?"
 */
export function parseTotalChapters(chaptersStr: string | null): {
  current: number;
  total: number | null;
} {
  if (!chaptersStr) return { current: 0, total: null };
  const parts = chaptersStr.split("/");
  const current = Number.parseInt(parts[0], 10) || 0;
  const total = parts[1] === "?" ? null : Number.parseInt(parts[1], 10) || null;
  return { current, total };
}

/**
 * Get the tag type ID for a given tag category
 */
function getTagTypeId(category: string): TTagTypeId {
  switch (category) {
    case "rating":
      return tagTypes.rating;
    case "warning":
      return tagTypes.warning;
    case "category":
      return tagTypes.category;
    case "fandom":
      return tagTypes.fandom;
    case "relationship":
      return tagTypes.relationship;
    case "character":
      return tagTypes.character;
    case "freeform":
      return tagTypes.freeform;
    default:
      return tagTypes.unknown;
  }
}

/**
 * Collect all tags from parsed work tags
 */
export function collectTags(workTags: {
  rating: TagInfo | null;
  warning: TagInfo[];
  category: TagInfo[];
  fandom: TagInfo[];
  relationship: TagInfo[];
  character: TagInfo[];
  freeform: TagInfo[];
}): TagData[] {
  const allTags: TagData[] = [];

  const addTags = (tags: TagInfo[], category: string) => {
    for (const tagInfo of tags) {
      if (tagInfo.tag && tagInfo.href) {
        allTags.push({
          tag: tagInfo.tag,
          href: tagInfo.href,
          typeId: getTagTypeId(category),
        });
      }
    }
  };

  if (workTags.rating?.tag && workTags.rating?.href) {
    allTags.push({
      tag: workTags.rating.tag,
      href: workTags.rating.href,
      typeId: tagTypes.rating,
    });
  }
  addTags(workTags.warning, "warning");
  addTags(workTags.category, "category");
  addTags(workTags.fandom, "fandom");
  addTags(workTags.relationship, "relationship");
  addTags(workTags.character, "character");
  addTags(workTags.freeform, "freeform");

  return allTags;
}

/**
 * Map parsed chapter index to ChapterData array (includes dates)
 */
export function mapChaptersFromIndex(chapters: ChapterInfo[], workId: number): ChapterData[] {
  return chapters
    .map((ch) => {
      const chapterId = extractChapterId(ch.chapterUrl);
      if (!chapterId) return null;
      return {
        id: chapterId,
        workId,
        number: extractChapterNumber(ch.chapterNumber),
        title: ch.chapterNumber,
        dateUpdated: parseAo3Date(ch.chapterDate?.replace(/[()]/g, "") ?? null),
      };
    })
    .filter((ch): ch is ChapterData => ch !== null);
}

/**
 * Map chapter dropdown entries to ChapterData array (no dates)
 */
export function mapChaptersFromDropdown(
  chapters: ChapterDropdownInfo[],
  workId: number,
): ChapterData[] {
  return chapters.map((ch) => ({
    id: ch.chapterId,
    workId,
    number: extractChapterNumber(ch.chapterTitle),
    title: ch.chapterTitle,
    dateUpdated: null,
  }));
}

/**
 * Merge chapter data: use index data for chapters that have dates,
 * fallback to dropdown data for chapters without dates
 */
export function mergeChapterData(
  dropdownChapters: ChapterData[],
  indexChapters: ChapterData[],
): ChapterData[] {
  const indexMap = new Map(indexChapters.map((ch) => [ch.id, ch]));

  return dropdownChapters.map((dropdownCh) => {
    const indexCh = indexMap.get(dropdownCh.id);
    if (indexCh) {
      // Prefer index data (has date)
      return indexCh;
    }
    // Fallback to dropdown data (no date)
    return dropdownCh;
  });
}
