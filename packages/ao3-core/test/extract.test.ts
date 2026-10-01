import { describe, expect, it } from "vite-plus/test";
import {
  findListWorkIds,
  getWorkInfo,
  injectSaveSearchButton,
  isFilterableListPage,
} from "~/dom/extract";

function makeDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

describe("findListWorkIds", () => {
  it("extracts work ids from blurb list items", () => {
    const doc = makeDoc(`
      <ol>
        <li id="work_123"></li>
        <li id="work_456"></li>
        <li id="not_a_work"></li>
      </ol>
    `);
    expect(findListWorkIds(doc)).toEqual([123, 456]);
  });

  it("returns empty when nothing matches", () => {
    const doc = makeDoc("<div></div>");
    expect(findListWorkIds(doc)).toEqual([]);
  });
});

describe("getWorkInfo", () => {
  it("returns the canonical shape with sensible nulls when fields are missing", () => {
    const doc = makeDoc(`
      <div id="workskin">
        <h2 class="title heading">My Work</h2>
        <div class="byline heading"><a href="/users/foo">foo</a></div>
      </div>
      <div class="work meta group">
        <dl>
          <dd class="published">2024-01-01</dd>
          <dl class="stats">
            <dd class="words">12,345</dd>
            <dd class="chapters">3/5</dd>
          </dl>
        </dl>
      </div>
    `);
    const location = {
      href: "https://archiveofourown.org/works/1",
      pathname: "/works/1",
    } as Location;
    const info = getWorkInfo(doc, location);
    expect(info.type).toBe("workInfo");
    expect(info.workName).toBe("My Work");
    expect(info.authorName).toBe("foo");
    expect(info.authorUrl).toBe("/users/foo");
    expect(info.wordCount).toBe("12345");
    expect(info.totalChapters).toBe("3/5");
    expect(info.isPrivate).toBe(false);
  });
});

const listLocation = (href: string): Location => ({ href }) as Location;

describe("isFilterableListPage", () => {
  it("is true when the filter form is present on a list URL", () => {
    const doc = makeDoc(`<div id="main"><form id="work-filters"></form></div>`);
    expect(
      isFilterableListPage(doc, listLocation("https://archiveofourown.org/tags/Foo/works")),
    ).toBe(true);
  });

  it("is true when a results list is present even without the form", () => {
    const doc = makeDoc(`<ol><li id="work_123"></li></ol>`);
    expect(
      isFilterableListPage(
        doc,
        listLocation("https://archiveofourown.org/works?work_search[query]=x"),
      ),
    ).toBe(true);
  });

  it("is true for a bookmarks listing", () => {
    const doc = makeDoc(`<ol><li id="bookmark_99"></li></ol>`);
    expect(
      isFilterableListPage(doc, listLocation("https://archiveofourown.org/users/foo/bookmarks")),
    ).toBe(true);
  });

  it("is false on a single work page", () => {
    const doc = makeDoc(`<div id="main"><form id="work-filters"></form></div>`);
    expect(isFilterableListPage(doc, listLocation("https://archiveofourown.org/works/123"))).toBe(
      false,
    );
  });

  it("is false on a list URL with no filter form or results", () => {
    const doc = makeDoc(`<div id="main"></div>`);
    expect(isFilterableListPage(doc, listLocation("https://archiveofourown.org/"))).toBe(false);
  });
});

describe("injectSaveSearchButton", () => {
  const filterHtml = `<div id="main"><h2 class="heading">Works</h2><form id="work-filters"></form></div>`;

  it("injects a single button and calls back with the href on click", () => {
    const doc = makeDoc(filterHtml);
    const location = listLocation("https://archiveofourown.org/tags/Foo/works");
    const seen: string[] = [];
    const btn = injectSaveSearchButton(doc, location, (url) => seen.push(url));

    expect(btn).not.toBeNull();
    expect(doc.querySelectorAll("button.ao3-tracker-save-search")).toHaveLength(1);

    btn?.click();
    expect(seen).toEqual(["https://archiveofourown.org/tags/Foo/works"]);
  });

  it("is idempotent — a second call reuses the existing button", () => {
    const doc = makeDoc(filterHtml);
    const location = listLocation("https://archiveofourown.org/tags/Foo/works");
    const first = injectSaveSearchButton(doc, location, () => {});
    const second = injectSaveSearchButton(doc, location, () => {});

    expect(second).toBe(first);
    expect(doc.querySelectorAll("button.ao3-tracker-save-search")).toHaveLength(1);
  });

  it("returns null on a non-filterable page", () => {
    const doc = makeDoc(`<div id="main"></div>`);
    expect(
      injectSaveSearchButton(doc, listLocation("https://archiveofourown.org/works/123"), () => {}),
    ).toBeNull();
  });
});
