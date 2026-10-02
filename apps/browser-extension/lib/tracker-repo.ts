import type { WebViewMessage, WorkBadgeData } from "@qcksys/ao3tracker-core";
import { classifyAo3Url } from "@qcksys/ao3tracker-core";
import { workReadingUrl } from "./work-navigation";
import { deriveStatus } from "./works-view";
import {
  chapterKey,
  chapterMetadataItem,
  type TrackedChapter,
  type TrackedWork,
  trackedChaptersItem,
  trackedWorksItem,
  workMetadataItem,
} from "./storage";

/**
 * Local tracker repository. Mirrors what `Ao3Repository` does in the native
 * app: handles page-event ingestion (turning DOM extraction into tracker
 * rows), computes badge data, and toggles per-work flags.
 *
 * All mutations set `pendingSync = true` so the sync engine knows to push.
 */

function nowIso(): string {
  return new Date().toISOString();
}

function nextReadAt(previous: string | undefined): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}

function parseChapterIdFromUrl(url: string): number | null {
  const match = new URL(url).pathname.match(/\/chapters\/(\d+)/);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

async function loadWorks(): Promise<Record<number, TrackedWork>> {
  return trackedWorksItem.getValue();
}

async function loadChapters(): Promise<Record<string, TrackedChapter>> {
  return trackedChaptersItem.getValue();
}

async function saveWork(works: Record<number, TrackedWork>): Promise<void> {
  await trackedWorksItem.setValue(works);
}

async function saveChapter(chapters: Record<string, TrackedChapter>): Promise<void> {
  await trackedChaptersItem.setValue(chapters);
}

function ensureWork(works: Record<number, TrackedWork>, workId: number): TrackedWork {
  const existing = works[workId];
  if (existing) return existing;
  const seed: TrackedWork = {
    workId,
    lastReadAt: nowIso(),
    markedCompleteAt: null,
    private: false,
    subscribed: true,
    favourite: false,
    subscribedUpdatedAt: null,
    favouriteUpdatedAt: null,
    deleted: false,
    pendingSync: true,
  };
  works[workId] = seed;
  return seed;
}

/**
 * Ingest a `WebViewMessage` produced by the content script. Returns a list of
 * affected workIds so the caller can trigger a debounced sync.
 */
export async function ingestPageEvent(message: WebViewMessage): Promise<number[]> {
  const { workId } = classifyAo3Url(message.url);
  if (!workId) return [];

  switch (message.type) {
    case "workInfo": {
      const works = await loadWorks();
      const work = ensureWork(works, workId);
      work.lastReadAt = nextReadAt(work.lastReadAt);
      work.deleted = false;
      work.private = message.isPrivate;
      work.pendingSync = true;
      await saveWork(works);

      const chapterIdRaw = message.chapterId;
      const chapterId = chapterIdRaw ? Number.parseInt(chapterIdRaw, 10) : 0;
      if (!Number.isNaN(chapterId)) {
        const chapters = await loadChapters();
        const key = chapterKey(workId, chapterId);
        const existing = chapters[key];
        chapters[key] = {
          workId,
          chapterId,
          lastReadAt: nextReadAt(existing?.lastReadAt),
          markedCompleteAt: existing?.markedCompleteAt ?? null,
          readProgress: existing?.readProgress ?? 0,
          pendingSync: true,
        };
        await saveChapter(chapters);
      }

      return [workId];
    }
    case "scrollProgress": {
      const extractedChapterId = Number(message.chapterId);
      const chapterId =
        Number.isSafeInteger(extractedChapterId) && extractedChapterId > 0
          ? extractedChapterId
          : (parseChapterIdFromUrl(message.url) ?? 0);
      const chapters = await loadChapters();
      const key = chapterKey(workId, chapterId);
      const existing = chapters[key];
      const progress = Math.max(0, Math.min(1, message.scrollPercentage / 100));
      chapters[key] = {
        workId,
        chapterId,
        lastReadAt: nextReadAt(existing?.lastReadAt),
        markedCompleteAt: existing?.markedCompleteAt ?? null,
        readProgress: Math.max(existing?.readProgress ?? 0, progress),
        pendingSync: true,
      };
      await saveChapter(chapters);

      const works = await loadWorks();
      const work = ensureWork(works, workId);
      work.lastReadAt = nextReadAt(work.lastReadAt);
      work.deleted = false;
      work.pendingSync = true;
      await saveWork(works);
      return [workId];
    }
    case "workChapterIndex": {
      const metadata = await chapterMetadataItem.getValue();
      metadata[workId] = message.chapters.flatMap((chapter, index) => {
        const chapterId = chapter.chapterUrl?.match(/\/chapters\/(\d+)/)?.[1];
        return chapterId
          ? [{ id: Number(chapterId), workId, number: index + 1, title: null, dateUpdated: null }]
          : [];
      });
      await chapterMetadataItem.setValue(metadata);
      return [];
    }
    default:
      // workTags / listWorks don't update tracker state in
      // the extension today (the api refresh-works cron does the heavy lifting
      // on metadata). They could be wired into local metadata caches later.
      return [];
  }
}

export async function getWorkReadingUrl(workId: number): Promise<string> {
  const [chapters, metadata] = await Promise.all([
    trackedChaptersItem.getValue(),
    chapterMetadataItem.getValue(),
  ]);
  return workReadingUrl(
    workId,
    Object.values(chapters).filter((chapter) => chapter.workId === workId),
    metadata[workId] ?? [],
  );
}

export async function setFavourite(workId: number, favourite: boolean): Promise<void> {
  const works = await loadWorks();
  const work = ensureWork(works, workId);
  work.favourite = favourite;
  work.favouriteUpdatedAt = nowIso();
  work.pendingSync = true;
  await saveWork(works);
}

export async function setSubscribed(workId: number, subscribed: boolean): Promise<void> {
  const works = await loadWorks();
  const work = ensureWork(works, workId);
  work.subscribed = subscribed;
  work.subscribedUpdatedAt = nowIso();
  work.pendingSync = true;
  await saveWork(works);
}

export async function markComplete(workId: number, complete: boolean): Promise<void> {
  const works = await loadWorks();
  const work = ensureWork(works, workId);
  work.markedCompleteAt = complete ? nowIso() : null;
  work.lastReadAt = nowIso();
  work.pendingSync = true;
  await saveWork(works);
}

export async function untrack(workId: number): Promise<void> {
  const works = await loadWorks();
  const work = ensureWork(works, workId);
  work.deleted = true;
  work.lastReadAt = nowIso();
  work.pendingSync = true;
  await saveWork(works);
}

/**
 * Compute badge data for a list of work IDs by joining local tracker rows
 * with metadata. Status derivation mirrors the native app:
 *
 *  - private: tracker.private = true
 *  - finished: markedCompleteAt set
 *  - has-new-chapters: server reports a newer chapter than we've read
 *  - caught-up: all known chapters at >= 0.95 readProgress
 *  - in-progress: any chapter has progress > 0 but not caught up
 *  - not-started: tracker row exists with no chapter progress
 */
export async function buildBadgePayloads(workIds: number[]): Promise<WorkBadgeData[]> {
  const works = await loadWorks();
  const chapters = await loadChapters();
  const metadata = await workMetadataItem.getValue();

  return workIds
    .map((workId) => {
      const w = works[workId];
      if (!w || w.deleted) return null;

      const meta = metadata[workId];
      const workChapters = Object.values(chapters).filter((c) => c.workId === workId);
      const { status, progressPercent } = deriveStatus(w, meta, workChapters);

      return {
        id: workId,
        status,
        progressPercent,
        currentChapters:
          meta?.currentChapters ?? workChapters.filter((chapter) => !chapter.deleted).length,
        favourite: w.favourite,
      } satisfies WorkBadgeData;
    })
    .filter((b) => b !== null);
}

/**
 * Return the canonical "current work" row for the popup, or null if the user
 * hasn't tracked anything yet.
 */
export async function currentWorkSummary(): Promise<{
  workId: number;
  title: string | null;
  author: string | null;
  chapterId: number | null;
  progressPercent: number;
  lastReadAt: string;
  favourite: boolean;
} | null> {
  const works = await loadWorks();
  const chapters = await loadChapters();
  const metadata = await workMetadataItem.getValue();

  const sorted = Object.values(works)
    .filter((w) => !w.deleted)
    .sort((a, b) => Date.parse(b.lastReadAt) - Date.parse(a.lastReadAt));
  const top = sorted[0];
  if (!top) return null;

  const workChapters = Object.values(chapters)
    .filter((c) => c.workId === top.workId && !c.deleted)
    .sort((a, b) => Date.parse(b.lastReadAt) - Date.parse(a.lastReadAt));
  const latestChapter = workChapters[0] ?? null;

  return {
    workId: top.workId,
    title: metadata[top.workId]?.title ?? null,
    author: metadata[top.workId]?.author ?? null,
    chapterId: latestChapter?.chapterId ?? null,
    progressPercent: deriveStatus(top, metadata[top.workId], workChapters).progressPercent,
    lastReadAt: top.lastReadAt,
    favourite: top.favourite,
  };
}

export async function trackedWorkCount(): Promise<number> {
  const works = await loadWorks();
  return Object.values(works).filter((w) => !w.deleted).length;
}
