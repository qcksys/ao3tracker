import { describe, expect, it } from "vitest";
import { classifyAo3Url, normalizeWhitespace } from "./utils";

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace", () => {
    expect(normalizeWhitespace("  foo\n  bar\t baz ")).toBe("foo bar baz");
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeWhitespace("")).toBeNull();
    expect(normalizeWhitespace("   \n")).toBeNull();
    expect(normalizeWhitespace(null)).toBeNull();
    expect(normalizeWhitespace(undefined)).toBeNull();
  });
});

describe("classifyAo3Url", () => {
  it("identifies a chapter URL", () => {
    const result = classifyAo3Url("https://archiveofourown.org/works/123/chapters/456");
    expect(result.isWork).toBe(true);
    expect(result.workId).toBe(123);
    expect(result.isChapterIndex).toBe(false);
    expect(result.isList).toBe(false);
  });

  it("identifies a work root URL", () => {
    const result = classifyAo3Url("https://archiveofourown.org/works/123");
    expect(result.isWork).toBe(true);
    expect(result.workId).toBe(123);
  });

  it("identifies a navigate page", () => {
    const result = classifyAo3Url("https://archiveofourown.org/works/123/navigate");
    expect(result.isWork).toBe(false);
    expect(result.isChapterIndex).toBe(true);
    expect(result.workId).toBe(123);
  });

  it("identifies list pages", () => {
    const result = classifyAo3Url("https://archiveofourown.org/users/foo/works");
    expect(result.isWork).toBe(false);
    expect(result.isChapterIndex).toBe(false);
    expect(result.isList).toBe(true);
    expect(result.workId).toBeNull();
  });
});
