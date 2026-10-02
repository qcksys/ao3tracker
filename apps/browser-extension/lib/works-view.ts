import type {
  SyncChapterMetadata,
  SyncTagMetadata,
  SyncWorkMetadata,
  WorkBadgeStatus,
} from "@qcksys/ao3tracker-core";
import { workReadingUrl } from "./work-navigation";

import type { TrackedChapter, TrackedWork } from "./storage";

/**
 * A flattened "row" representation for the Works list page — joins the local
 * tracker rows with the metadata and per-chapter progress cached locally.
 * Mirrors the data the native KMP `Work` model exposes to its `TrackScreen`.
 */
export interface WorksListRow {
  workId: number;
  readingUrl: string;
  // tracker
  lastReadAt: string;
  markedCompleteAt: string | null;
  private: boolean;
  subscribed: boolean;
  favourite: boolean;
  // metadata (nullable — may not be cached yet for newly seen works)
  title: string | null;
  author: string | null;
  language: string | null;
  wordCount: number | null;
  hits: number | null;
  kudos: number | null;
  bookmarks: number | null;
  comments: number | null;
  currentChapters: number | null;
  totalChapters: number | null;
  published: string | null;
  lastUpdated: string | null;
  // derived
  status: WorkBadgeStatus;
  progressPercent: number;
  tags: ReadonlySet<string>;
}

export type SortField =
  | "lastRead"
  | "title"
  | "author"
  | "wordCount"
  | "hits"
  | "kudos"
  | "bookmarks"
  | "comments"
  | "published"
  | "updated"
  | "currentChapters";

export type SortOrder = "asc" | "desc";

export interface WorksFilterState {
  searchQuery: string;
  /** Multi-select. Empty = no status restriction. */
  statuses: WorkBadgeStatus[];
  /** If true, restrict to favourites only. */
  favouritesOnly: boolean;
  /** If true, restrict to subscribed only. */
  subscribedOnly: boolean;
  /** Include works that have any of these tags. */
  includeTags: Set<string>;
}

export interface WorksSortState {
  field: SortField;
  order: SortOrder;
}

const COMPLETE_THRESHOLD = 0.95;
const EMPTY_TAG_SET: ReadonlySet<string> = new Set();

/**
 * Build the per-row status mirroring `buildBadgePayloads` in tracker-repo and
 * `Ao3Repository.buildBadgePayload` in the native app. Keep the precedence
 * in sync with both.
 */
export function deriveStatus(
  work: TrackedWork,
  metadata: SyncWorkMetadata | undefined,
  chapters: TrackedChapter[],
): { status: WorkBadgeStatus; progressPercent: number } {
  const hasAnyProgress = chapters.some((c) => c.readProgress > 0);
  const allComplete =
    chapters.length > 0 && chapters.every((c) => c.readProgress >= COMPLETE_THRESHOLD);
  const maxProgress = chapters.reduce((acc, c) => Math.max(acc, c.readProgress), 0);
  const progressPercent = Math.round(maxProgress * 100);

  let status: WorkBadgeStatus = "not-started";
  if (work.private) status = "private";
  else if (work.markedCompleteAt !== null) status = "finished";
  else if (
    metadata?.currentChapters != null &&
    chapters.length < metadata.currentChapters &&
    hasAnyProgress
  )
    status = "has-new-chapters";
  else if (allComplete) status = "caught-up";
  else if (hasAnyProgress) status = "in-progress";

  return { status, progressPercent };
}

export function buildWorksList(input: {
  works: Record<number, TrackedWork>;
  metadata: Record<number, SyncWorkMetadata>;
  chapters: Record<string, TrackedChapter>;
  chapterMetadata: Record<number, SyncChapterMetadata[]>;
  tagMetadata: SyncTagMetadata[];
}): WorksListRow[] {
  const tagsByWork = new Map<number, Set<string>>();
  for (const t of input.tagMetadata) {
    let set = tagsByWork.get(t.workId);
    if (!set) tagsByWork.set(t.workId, (set = new Set()));
    set.add(t.tag);
  }

  const chaptersByWork = new Map<number, TrackedChapter[]>();
  for (const c of Object.values(input.chapters)) {
    const list = chaptersByWork.get(c.workId);
    if (list) list.push(c);
    else chaptersByWork.set(c.workId, [c]);
  }

  const rows: WorksListRow[] = [];
  for (const w of Object.values(input.works)) {
    if (w.deleted) continue;
    const meta = input.metadata[w.workId];
    const workChapters = chaptersByWork.get(w.workId) ?? [];
    const { status, progressPercent } = deriveStatus(w, meta, workChapters);
    rows.push({
      workId: w.workId,
      readingUrl: workReadingUrl(w.workId, workChapters, input.chapterMetadata[w.workId] ?? []),
      lastReadAt: w.lastReadAt,
      markedCompleteAt: w.markedCompleteAt,
      private: w.private,
      subscribed: w.subscribed,
      favourite: w.favourite,
      title: meta?.title ?? null,
      author: meta?.author ?? null,
      language: meta?.language ?? null,
      wordCount: meta?.wordCount ?? null,
      hits: meta?.hits ?? null,
      kudos: meta?.kudos ?? null,
      bookmarks: meta?.bookmarks ?? null,
      comments: meta?.comments ?? null,
      currentChapters: meta?.currentChapters ?? null,
      totalChapters: meta?.totalChapters ?? null,
      published: meta?.published ?? null,
      lastUpdated: meta?.lastUpdated ?? null,
      status,
      progressPercent,
      tags: tagsByWork.get(w.workId) ?? EMPTY_TAG_SET,
    });
  }
  return rows;
}

export function applyFilters(rows: WorksListRow[], filter: WorksFilterState): WorksListRow[] {
  const q = filter.searchQuery.trim().toLowerCase();
  const includeTags = filter.includeTags.size > 0 ? Array.from(filter.includeTags) : null;
  return rows.filter((row) => {
    if (filter.favouritesOnly && !row.favourite) return false;
    if (filter.subscribedOnly && !row.subscribed) return false;
    if (filter.statuses.length > 0 && !filter.statuses.includes(row.status)) return false;
    if (includeTags !== null) {
      for (const tag of includeTags) {
        if (!row.tags.has(tag)) return false;
      }
    }
    if (q.length > 0) {
      const haystack = [row.title ?? "", row.author ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function compareNullable(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function applySort(rows: WorksListRow[], sort: WorksSortState): WorksListRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (sort.field) {
      case "lastRead":
        return compareNullable(Date.parse(a.lastReadAt) || null, Date.parse(b.lastReadAt) || null);
      case "title":
        return compareNullable(a.title?.toLowerCase() ?? null, b.title?.toLowerCase() ?? null);
      case "author":
        return compareNullable(a.author?.toLowerCase() ?? null, b.author?.toLowerCase() ?? null);
      case "wordCount":
        return compareNullable(a.wordCount, b.wordCount);
      case "hits":
        return compareNullable(a.hits, b.hits);
      case "kudos":
        return compareNullable(a.kudos, b.kudos);
      case "bookmarks":
        return compareNullable(a.bookmarks, b.bookmarks);
      case "comments":
        return compareNullable(a.comments, b.comments);
      case "published":
        return compareNullable(
          a.published ? Date.parse(a.published) : null,
          b.published ? Date.parse(b.published) : null,
        );
      case "updated":
        return compareNullable(
          a.lastUpdated ? Date.parse(a.lastUpdated) : null,
          b.lastUpdated ? Date.parse(b.lastUpdated) : null,
        );
      case "currentChapters":
        return compareNullable(a.currentChapters, b.currentChapters);
    }
  });
  return sort.order === "desc" ? sorted.reverse() : sorted;
}

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  lastRead: "Last read",
  title: "Title",
  author: "Author",
  wordCount: "Word count",
  hits: "Hits",
  kudos: "Kudos",
  bookmarks: "Bookmarks",
  comments: "Comments",
  published: "Published",
  updated: "Updated",
  currentChapters: "Chapters",
};

export const STATUS_LABELS: Record<WorkBadgeStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  "caught-up": "Caught up",
  finished: "Finished",
  "has-new-chapters": "New chapters",
  private: "Private",
};
