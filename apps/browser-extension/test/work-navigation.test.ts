import { describe, expect, it } from "vite-plus/test";
import { workReadingUrl } from "../lib/work-navigation";
import type { TrackedChapter } from "../lib/storage";

const chapter = (
  chapterId: number,
  readProgress: number,
  lastReadAt = "2026-10-02T00:00:00Z",
): TrackedChapter => ({
  workId: 1,
  chapterId,
  readProgress,
  lastReadAt,
  markedCompleteAt: null,
  pendingSync: false,
});
const metadata = [
  { id: 80, workId: 1, number: 3, title: null, dateUpdated: null },
  { id: 91, workId: 1, number: 1, title: null, dateUpdated: null },
  { id: 42, workId: 1, number: 2, title: null, dateUpdated: null },
];

describe("work reading links", () => {
  it("opens the next chapter by chapter number at zero progress", () => {
    for (const current of [
      chapter(91, 0.95),
      { ...chapter(91, 0.4), markedCompleteAt: "2026-10-02T00:00:00Z" },
    ]) {
      expect(workReadingUrl(1, [chapter(42, 0.5, "2026-10-01T00:00:00Z"), current], metadata)).toBe(
        "https://archiveofourown.org/works/1/chapters/42?scrollTo=0#chapters",
      );
    }
  });

  it("retains unfinished progress and finished final chapters", () => {
    expect(workReadingUrl(1, [chapter(91, 0.94)], metadata)).toBe(
      "https://archiveofourown.org/works/1/chapters/91?scrollTo=94#chapters",
    );
    expect(workReadingUrl(1, [chapter(80, 1)], metadata)).toBe(
      "https://archiveofourown.org/works/1/chapters/80?scrollTo=100#chapters",
    );
  });

  it("does not open deleted chapters or skip across missing chapter numbers", () => {
    expect(
      workReadingUrl(1, [chapter(91, 1), { ...chapter(42, 0), deleted: true }], metadata),
    ).toBe("https://archiveofourown.org/works/1/chapters/91?scrollTo=100#chapters");
    expect(
      workReadingUrl(
        1,
        [chapter(91, 1)],
        metadata.filter((entry) => entry.number !== 2),
      ),
    ).toBe("https://archiveofourown.org/works/1/chapters/91?scrollTo=100#chapters");
  });

  it("falls back safely for unread works, chapter zero, and absent metadata", () => {
    expect(workReadingUrl(1, [], [])).toBe("https://archiveofourown.org/works/1");
    expect(workReadingUrl(1, [chapter(0, 0.4)], [])).toBe(
      "https://archiveofourown.org/works/1?scrollTo=40#chapters",
    );
    expect(workReadingUrl(1, [chapter(91, 1)], [])).toBe(
      "https://archiveofourown.org/works/1/chapters/91?scrollTo=100#chapters",
    );
  });
});
