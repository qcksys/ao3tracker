import { describe, expect, it } from "vite-plus/test";
import { readSearchPage } from "~/dom";

const url = "https://archiveofourown.org/tags/Test/works?work_search[query]=test";
const doc = (html: string) => {
  const result = document.implementation.createHTMLDocument();
  result.body.innerHTML = html;
  return result;
};

describe("saved search result extraction", () => {
  it("extracts work revisions without including activity counters", () => {
    const page = doc(`<div id="main"><ol class="work index group">
      <li id="work_123"><div class="header"><p class="datetime">02 Oct 2026</p></div>
        <dl><dd class="chapters"><a>3</a>/10</dd><dd class="words">12,345</dd><dd class="hits">500</dd></dl>
      </li></ol></div>`);
    expect(readSearchPage(page, url).works).toEqual([
      { id: 123, updated: "02 Oct 2026", chapters: "3/10", words: "12345" },
    ]);
    page.querySelector("dd.hits")!.textContent = "501";
    expect(readSearchPage(page, url).works[0]).toEqual({
      id: 123,
      updated: "02 Oct 2026",
      chapters: "3/10",
      words: "12345",
    });
  });

  it("deduplicates work bookmarks and excludes series and external works", () => {
    const page = doc(`<div id="main"><ol class="bookmark index group">
      <li id="bookmark_1"><h4 class="heading"><a href="/works/123">Work</a></h4></li>
      <li id="bookmark_2"><h4 class="heading"><a href="/works/123">Same work</a></h4></li>
      <li id="bookmark_3"><h4 class="heading"><a href="/series/456">Series</a></h4></li>
      <li id="bookmark_4"><h4 class="heading"><a href="https://example.com">External</a></h4></li>
      <li id="bookmark_5"><p>Deleted work</p></li>
    </ol></div>`);
    expect(
      readSearchPage(page, url.replace("/works?", "/bookmarks?")).works.map((work) => work.id),
    ).toEqual([123]);
  });

  it("accepts an empty result list but rejects login and error pages", () => {
    const emptyAdvancedSearch = doc(
      '<div id="main"><h2 class="heading">Search Results</h2><p>No results found. You may want to edit your search to make it less specific.</p></div>',
    );
    expect(
      readSearchPage(emptyAdvancedSearch, `${url.replace("/tags/Test/works", "/works/search")}`)
        .works,
    ).toEqual([]);
    expect(
      readSearchPage(doc('<div id="main"><ol class="work index group"></ol></div>'), url).works,
    ).toEqual([]);
    expect(() =>
      readSearchPage(doc('<div id="main"><form id="new_user"></form></div>'), url),
    ).toThrow("Could not read AO3 results");
    expect(() =>
      readSearchPage(doc('<div id="main"><h1>Too many requests</h1></div>'), url),
    ).toThrow();
  });

  it("follows only pagination belonging to the same search", () => {
    const page = doc(
      '<div id="main"><ol class="work index"></ol><ol class="pagination"><li class="next"><a href="?work_search[query]=test&amp;page=2">Next</a></li></ol></div>',
    );
    expect(readSearchPage(page, url).next).toContain("page=2");
    page.querySelector("a")!.setAttribute("href", "https://example.com/?page=2");
    expect(() => readSearchPage(page, url)).toThrow("different search");
    page.querySelector("a")!.setAttribute("href", "?work_search[query]=other&page=2");
    expect(() => readSearchPage(page, url)).toThrow("different search");
  });
});
