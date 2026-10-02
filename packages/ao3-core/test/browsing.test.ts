import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyHiddenWorks,
  injectSaveSearchButton,
  installDefaultSearchTags,
  normalizeHiddenTags,
  savedSearchKey,
  updateSavedSearchButton,
  withDefaultHiddenTags,
} from "~/dom";

const origin = "https://archiveofourown.org";
const doc = (html: string) => {
  const result = document.implementation.createHTMLDocument();
  result.body.innerHTML = html;
  return result;
};
const location = (href: string) => ({ href }) as Location;

describe("default hidden tags", () => {
  it("trims and deduplicates tags without changing their spelling", () => {
    expect(normalizeHiddenTags([" Angst \nFluff, angst", "", "A/B & C"])).toEqual([
      "Angst",
      "Fluff",
      "A/B & C",
    ]);
  });

  it.each([
    "/works",
    "/works/search",
    "/tags/Foo/works",
    "/users/reader/works",
    "/collections/test/works",
  ])("merges exclusions and preserves filters on %s", (path) => {
    const url = `${origin}${path}?work_search[query]=hello&work_search[excluded_tag_names]=Angst&page=3#results`;
    const result = withDefaultHiddenTags(url, ["angst", "A/B & C"]);
    const parsed = new URL(result);
    expect(parsed.searchParams.get("work_search[excluded_tag_names]")).toBe("Angst, A/B & C");
    expect(parsed.searchParams.get("work_search[query]")).toBe("hello");
    expect(parsed.searchParams.get("page")).toBe("3");
    expect(parsed.hash).toBe("#results");
    expect(withDefaultHiddenTags(result, ["angst", "A/B & C"])).toBe(result);
  });

  it("uses bookmark work-tag exclusions without replacing bookmark tag filters", () => {
    const result = new URL(
      withDefaultHiddenTags(
        `${origin}/users/foo/bookmarks?bookmark_search[excluded_bookmark_tag_names]=Private`,
        ["Angst"],
      ),
    );
    expect(result.searchParams.get("bookmark_search[excluded_tag_names]")).toBe("Angst");
    expect(result.searchParams.get("bookmark_search[excluded_bookmark_tag_names]")).toBe("Private");
  });

  it.each([
    "/works/123",
    "/works/123/chapters/456",
    "/works/new",
    "/tags/search",
    "/works/search",
    "/bookmarks/search",
    "/",
  ])("leaves non-result URLs alone: %s", (path) => {
    expect(withDefaultHiddenTags(`${origin}${path}`, ["Angst"])).toBe(`${origin}${path}`);
  });

  it("leaves other origins and empty preferences alone", () => {
    expect(withDefaultHiddenTags("https://example.com/works", ["Angst"])).toBe(
      "https://example.com/works",
    );
    expect(withDefaultHiddenTags(`${origin}/works`, [])).toBe(`${origin}/works`);
  });

  it("injects defaults at submission, preserving exclusions and reading updated settings", () => {
    const page = doc(
      `<form action="/works/search" method="get"><input name="work_search[excluded_tag_names]" value="Existing"></form>`,
    );
    let tags = ["Angst"];
    const cleanup = installDefaultSearchTags(page, location(`${origin}/works/search`), () => tags);
    const form = page.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(form.querySelector("input")?.value).toBe("Existing, Angst");
    tags = ["Fluff"];
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(form.querySelector("input")?.value).toBe("Existing, Angst, Fluff");
    expect(form.querySelectorAll("input")).toHaveLength(1);
    cleanup();
  });

  it("adds an exclusion field to the quick search without changing POST forms", () => {
    const page = doc(
      `<form action="/works/search"></form><form action="/works" method="post"></form>`,
    );
    const cleanup = installDefaultSearchTags(page, location(origin), () => ["Angst"]);
    for (const form of page.querySelectorAll("form"))
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(page.querySelector("form input")?.getAttribute("name")).toBe(
      "work_search[excluded_tag_names]",
    );
    expect(page.querySelector('form[method="post"] input')).toBeNull();
    cleanup();
  });
});

describe("saved search label", () => {
  it("matches reordered filters, default tags and pagination; restores the action on deletion", () => {
    const saved = `${origin}/tags/Foo/works?work_search[query]=hello&work_search[complete]=T`;
    const current = withDefaultHiddenTags(
      `${origin}/tags/Foo/works?work_search[complete]=T&page=2&work_search[query]=hello&utf8=x&commit=Search#main`,
      ["Angst"],
    );
    const page = doc(
      '<div id="main"><h2 class="heading">Works</h2><form id="work-filters"></form></div>',
    );
    const onSave = vi.fn();
    const button = injectSaveSearchButton(page, location(current), onSave)!;
    updateSavedSearchButton(page, current, [saved], ["Angst"]);
    expect(button.textContent).toBe("Saved search");
    expect(button.disabled).toBe(true);
    button.click();
    expect(onSave).not.toHaveBeenCalled();
    updateSavedSearchButton(page, current, [], ["Angst"]);
    expect(button.textContent).toBe("Save this search");
    button.click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("keeps distinct searches distinct and ignores invalid saved URLs", () => {
    expect(savedSearchKey(`${origin}/works?work_search[query]=one`)).not.toBe(
      savedSearchKey(`${origin}/works?work_search[query]=two`),
    );
    expect(savedSearchKey("not a url")).toBeNull();
    expect(savedSearchKey("https://example.com/works")).toBeNull();
  });

  it("shows the button for an empty search result", () => {
    const page = doc('<div id="main"><h2 class="heading">No results</h2></div>');
    expect(
      injectSaveSearchButton(
        page,
        location(`${origin}/works/search?work_search[query]=missing`),
        vi.fn(),
      ),
    ).not.toBeNull();
  });
});

describe("hidden works", () => {
  it("hides every occurrence by work ID and supports undo without removing the blurb", () => {
    const page = doc(
      `<ol><li id="work_123"><h4 class="heading"><a href="/works/123">Title</a></h4></li><li id="work_456"></li><li id="bookmark_77"><h4 class="heading"><a href="/works/123">Title</a></h4></li><li id="bookmark_88"><h4 class="heading"><a href="/series/123">Series</a></h4></li></ol>`,
    );
    const change = vi.fn();
    applyHiddenWorks(page, [], change);
    page.querySelector<HTMLButtonElement>("#work_123 button")?.click();
    expect(change).toHaveBeenCalledWith(123, true);
    applyHiddenWorks(page, [123], change);
    applyHiddenWorks(page, [123], change);
    expect(page.querySelectorAll(".ao3-tracker-work-hidden")).toHaveLength(2);
    expect(page.querySelectorAll(".ao3-tracker-hidden-work")).toHaveLength(2);
    expect(page.querySelectorAll(".ao3-tracker-hide-work")).toHaveLength(3);
    page.querySelector<HTMLButtonElement>(".ao3-tracker-hidden-work button")?.click();
    expect(change).toHaveBeenLastCalledWith(123, false);
    applyHiddenWorks(page, [], change);
    expect(
      page.querySelectorAll(".ao3-tracker-work-hidden, .ao3-tracker-hidden-work"),
    ).toHaveLength(0);
    expect(page.querySelector("#work_123 h4")?.textContent).toBe("Title");
  });
});
