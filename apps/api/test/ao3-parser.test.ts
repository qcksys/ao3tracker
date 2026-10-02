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
    it.each([
      [
        "multiple paragraphs",
        "<p>First paragraph.</p><p>Second paragraph.</p>",
        "First paragraph. Second paragraph.",
      ],
      [
        "inline formatting",
        "<p>Before <em>formatted</em> text and un<strong>broken</strong> words.</p>",
        "Before formatted text and unbroken words.",
      ],
      [
        "line breaks and bare text",
        "First line.<br>Second line.<div>Last line.</div>",
        "First line. Second line. Last line.",
      ],
      [
        "nested blocks",
        "<p>Intro.</p><blockquote><p>Quoted.</p></blockquote><p>End.</p>",
        "Intro. Quoted. End.",
      ],
      ["empty summaries", "<p> \n </p>", null],
      ["exactly 2048 characters", `<p>${"a".repeat(2048)}</p>`, "a".repeat(2048)],
      [
        "long summaries",
        `<p>${"a".repeat(2000)}</p><p>${"b".repeat(100)}</p>`,
        `${"a".repeat(2000)} ${"b".repeat(47)}`,
      ],
      ["Unicode at the limit", `<p>${"a".repeat(2047)}📚extra</p>`, `${"a".repeat(2047)}📚`],
    ])("extracts the full work summary: %s", async (_name, content, expected) => {
      const result = await parseWorkPage(`<div id="workskin">
        <div class="preface group"><div class="summary module"><blockquote>${content}</blockquote></div></div>
        <div id="chapters"><div class="chapter preface group"><div class="summary module"><blockquote><p>Chapter summary.</p></blockquote></div></div></div>
      </div>`);
      expect(result.workInfo.summary).toBe(expected);
    });

    it("does not use the chapter summary when the work has no summary", async () => {
      const result =
        await parseWorkPage(`<div id="workskin"><div id="chapters"><div class="chapter preface group">
        <div class="summary module"><blockquote><p>Chapter summary.</p></blockquote></div>
      </div></div></div>`);
      expect(result.workInfo.summary).toBeNull();
    });

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
