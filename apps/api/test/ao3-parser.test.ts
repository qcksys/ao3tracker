import { describe, expect, it } from "vitest";
import { parseChapterIndex, parseWorkPage } from "~/lib/ao3-parser";
import {
  chapterIndexHtml,
  chapterIndexNoAuthorHtml,
  emptyChapterIndexHtml,
  minimalHtml,
  workPageHtml,
  workPageOnlyPublishedHtml,
} from "~test/ao3-parser.fixtures";

describe("ao3-parser", () => {
  describe("parseWorkPage", () => {
    it("should parse full work page", async () => {
      const result = await parseWorkPage(workPageHtml);
      expect(result.workInfo).toMatchSnapshot("workInfo");
      expect(result.workTags).toMatchSnapshot("workTags");
      expect(result.chapters).toMatchSnapshot("chapters");
    });

    it("should use published date when no status date exists", async () => {
      const result = await parseWorkPage(workPageOnlyPublishedHtml);
      expect(result).toMatchSnapshot();
    });

    it("should handle minimal HTML without errors", async () => {
      const result = await parseWorkPage(minimalHtml);
      expect(result).toMatchSnapshot();
    });

    it("should sync workLastUpdated between workInfo and workTags", async () => {
      const result = await parseWorkPage(workPageHtml);
      expect(result.workInfo.workLastUpdated).toBe(result.workTags.workLastUpdated);
    });
  });

  describe("parseChapterIndex", () => {
    it("should parse chapter index page", async () => {
      const result = await parseChapterIndex(chapterIndexHtml);
      expect(result).toMatchSnapshot();
    });

    it("should handle empty chapter list", async () => {
      const result = await parseChapterIndex(emptyChapterIndexHtml);
      expect(result).toMatchSnapshot();
    });

    it("should handle missing author", async () => {
      const result = await parseChapterIndex(chapterIndexNoAuthorHtml);
      expect(result).toMatchSnapshot();
    });
  });
});
