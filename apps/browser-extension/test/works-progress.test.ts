import { describe, expect, it, vi } from "vite-plus/test";
import type { SyncWorkMetadata } from "@qcksys/ao3tracker-core/schemas";
import type { TrackedChapter, TrackedWork } from "../lib/storage";
import { deriveStatus } from "../lib/works-view";

const persisted = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (key: string, options: { fallback: unknown }) => ({
      getValue: async () => persisted.get(key) ?? options.fallback,
      setValue: async (value: unknown) => {
        persisted.set(key, value);
      },
    }),
  },
}));
import { currentWorkSummary, buildBadgePayloads } from "../lib/tracker-repo";
import { trackedWorksItem, trackedChaptersItem, workMetadataItem } from "../lib/storage";

const work: TrackedWork = {
  workId: 1,
  lastReadAt: "2026-10-02T00:00:00Z",
  markedCompleteAt: null,
  private: false,
  subscribed: false,
  favourite: false,
  subscribedUpdatedAt: null,
  favouriteUpdatedAt: null,
  deleted: false,
  pendingSync: false,
};
const metadata: SyncWorkMetadata = {
  id: 1,
  title: "Story",
  author: null,
  authorUrl: null,
  summary: null,
  language: null,
  wordCount: null,
  currentChapters: 2,
  totalChapters: 10,
  hits: null,
  kudos: null,
  bookmarks: null,
  comments: null,
  downloadPath: null,
  published: "2026-10-01T00:00:00Z",
  lastUpdated: "2026-10-02T00:00:00Z",
  downloadUpdatedAt: null,
};
const chapter = (id: number, progress: number): TrackedChapter => ({
  workId: 1,
  chapterId: id,
  readProgress: progress,
  markedCompleteAt: null,
  lastReadAt: work.lastReadAt,
  pendingSync: false,
});

describe("published reading progress", () => {
  it("uses the same work percentage in badges and the current-work summary", async () => {
    await trackedWorksItem.setValue({ 1: work });
    await workMetadataItem.setValue({ 1: metadata });
    await trackedChaptersItem.setValue({
      "1:1": chapter(1, 1),
      "1:2": { ...chapter(2, 0.5), lastReadAt: "2026-10-02T01:00:00Z" },
      "1:3": { ...chapter(3, 1), deleted: true, lastReadAt: "2026-10-02T02:00:00Z" },
    });
    expect(await currentWorkSummary()).toMatchObject({ progressPercent: 75, chapterId: 2 });
    expect(await buildBadgePayloads([1])).toMatchObject([{ id: 1, progressPercent: 75 }]);
  });

  it("averages progress over published chapters rather than planned or most-read chapters", () => {
    expect(deriveStatus(work, metadata, [chapter(1, 1), chapter(2, 0.5)]).progressPercent).toBe(75);
    expect(deriveStatus(work, metadata, [chapter(1, 1)]).progressPercent).toBe(50);
    expect(deriveStatus(work, undefined, [chapter(1, 0.5)]).progressPercent).toBe(50);
    expect(deriveStatus(work, metadata, []).progressPercent).toBe(0);
  });
  it("excludes deleted chapters and clamps progress", () => {
    expect(
      deriveStatus(work, metadata, [chapter(1, 1), { ...chapter(2, 1), deleted: true }])
        .progressPercent,
    ).toBe(50);
    expect(deriveStatus(work, { ...metadata, currentChapters: 0 }, []).progressPercent).toBe(0);
  });
  it("distinguishes caught-up and finished works and exposes new chapters after completion", () => {
    const chapters = [chapter(1, 1), chapter(2, 1)];
    expect(deriveStatus(work, metadata, chapters).status).toBe("caught-up");
    expect(deriveStatus(work, { ...metadata, totalChapters: 2 }, chapters).status).toBe("finished");
    expect(
      deriveStatus(
        { ...work, markedCompleteAt: work.lastReadAt },
        { ...metadata, currentChapters: 3 },
        chapters,
      ).status,
    ).toBe("has-new-chapters");
    expect(deriveStatus(work, metadata, [chapter(1, 1), chapter(2, 0)]).status).toBe("in-progress");
  });
});
