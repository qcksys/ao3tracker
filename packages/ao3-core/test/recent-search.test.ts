import { describe, expect, it } from "vite-plus/test";
import { recentSearchUrl } from "~/dom";

const since = Date.parse("2026-10-02T00:30:00Z");

describe("recent search URLs", () => {
  it("intersects the date window with the original work query and filters", () => {
    const original =
      "https://archiveofourown.org/tags/Test/works?work_search[query]=cats+OR+dogs&work_search[date_from]=2026-09-01&work_search[date_to]=2026-10-10&work_search[sort_column]=kudos_count&work_search[sort_direction]=asc";
    const result = new URL(recentSearchUrl(original, since));
    expect(result.searchParams.get("work_search[query]")).toBe(
      "(cats OR dogs) AND revised_at:[2026-10-01 TO *]",
    );
    expect(result.searchParams.get("work_search[date_from]")).toBe("2026-09-01");
    expect(result.searchParams.get("work_search[date_to]")).toBe("2026-10-10");
    expect(result.searchParams.get("work_search[sort_column]")).toBe("revised_at");
    expect(result.searchParams.get("work_search[sort_direction]")).toBe("desc");
  });

  it("filters bookmarkable revisions without changing bookmark dates or existing work dates", () => {
    const original =
      "https://archiveofourown.org/users/reader/bookmarks?bookmark_search[bookmarkable_query]=cats+OR+dogs&bookmark_search[date]=2025&bookmark_search[bookmarkable_date]=2026";
    const result = new URL(recentSearchUrl(original, since));
    expect(result.searchParams.get("bookmark_search[bookmarkable_query]")).toBe(
      "(cats OR dogs) AND revised_at:[2026-10-01 TO *]",
    );
    expect(result.searchParams.get("bookmark_search[date]")).toBe("2025");
    expect(result.searchParams.get("bookmark_search[bookmarkable_date]")).toBe("2026");
    expect(result.searchParams.get("bookmark_search[sort_column]")).toBe("bookmarkable_date");
    expect(result.searchParams.has("work_search[query]")).toBe(false);
  });

  it("sorts the initial baseline without imposing a date window", () => {
    const result = new URL(
      recentSearchUrl("https://archiveofourown.org/works/search?work_search[query]=cats", null),
    );
    expect(result.searchParams.get("work_search[query]")).toBe("cats");
    expect(result.searchParams.get("work_search[sort_column]")).toBe("revised_at");
  });

  it("rejects non-search URLs", () => {
    expect(() => recentSearchUrl("https://example.com/works", since)).toThrow();
    expect(() => recentSearchUrl("https://archiveofourown.org/works/123", since)).toThrow();
  });
});
