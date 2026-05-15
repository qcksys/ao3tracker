import { describe, expect, it } from "vitest";
import { findListWorkIds, getWorkInfo } from "~/dom/extract";

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
    const location = { href: "https://archiveofourown.org/works/1", pathname: "/works/1" } as Location;
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
