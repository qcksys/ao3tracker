import { describe, expect, it } from "vite-plus/test";
import {
  applyFandomLimit,
  applyHiddenWorks,
  installCrossoverLimit,
  readSearchPage,
  savedSearchKey,
  updateSavedSearchButton,
  withCrossoverLimit,
} from "~/dom";
import { browsingPreferencesSchema } from "~/schemas";

const origin = "https://archiveofourown.org";
const key = "work_search[crossover]";
const blurb = (id: string, count: number) =>
  `<li id="${id}"><h4 class="heading"><a href="/works/123">Work</a></h4><h5 class="fandoms">${Array.from({ length: count }, (_, i) => `<a class="tag" href="/tags/${i}/works">Fandom ${i}</a>`).join(", ")}</h5><ul class="tags"><li>Other tag</li></ul></li>`;

describe("crossover limits", () => {
  it.each([
    "/works",
    "/works/search?work_search[query]=hello",
    "/tags/Fluff/works",
    "/users/reader/works",
    "/collections/test/works",
  ])("excludes crossovers on %s only for a limit of one", (path) => {
    const href = `${origin}${path}`;
    const filtered = withCrossoverLimit(href, 1);
    expect(new URL(filtered).searchParams.getAll(key)).toEqual(["F"]);
    expect(withCrossoverLimit(filtered, 1)).toBe(filtered);
    expect(withCrossoverLimit(href, 3)).toBe(href);
    expect(withCrossoverLimit(href, null)).toBe(href);
  });

  it("replaces conflicting and duplicate filters while retaining the other search fields", () => {
    const href = `${origin}/works?${key}=T&${key}=F&work_search[query]=hello&page=2#results`;
    const filtered = new URL(withCrossoverLimit(href, 1));
    expect(filtered.searchParams.getAll(key)).toEqual(["F"]);
    expect(filtered.searchParams.get("work_search[query]")).toBe("hello");
    expect(filtered.searchParams.get("page")).toBe("2");
    expect(filtered.hash).toBe("#results");
  });

  it.each([
    "/works/search",
    "/works/123",
    "/works/123/chapters/456",
    "/bookmarks?query=test",
    "/users/reader/bookmarks",
    "/tags/search",
  ])("does not inject unsupported or empty searches: %s", (path) => {
    expect(withCrossoverLimit(`${origin}${path}`, 1)).toBe(`${origin}${path}`);
  });

  it("ignores other origins", () => {
    for (const href of ["https://example.com/works", "http://archiveofourown.org/works"])
      expect(withCrossoverLimit(href, 1)).toBe(href);
  });

  it("injects exactly one exclusion into GET forms and restores the original controls when disabled", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<form action="/works/search"><input type="radio" name="${key}" value="T" checked><input type="radio" name="${key}" value="F"><input name="work_search[query]" value="hello"></form>`;
    let limit: number | null = 1;
    const cleanup = installCrossoverLimit(doc, { href: origin } as Location, () => limit);
    const form = doc.querySelector("form")!;
    const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true }));
    submit();
    submit();
    expect(new FormData(form).getAll(key)).toEqual(["F"]);
    expect(new FormData(form).get("work_search[query]")).toBe("hello");
    limit = 3;
    submit();
    expect(new FormData(form).getAll(key)).toEqual(["T"]);
    limit = 1;
    submit();
    cleanup();
    expect(new FormData(form).getAll(key)).toEqual(["T"]);
  });

  it("supports quick search and ignores POST, bookmark and unrelated forms", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML =
      '<form action="/works/search"></form><form method="post" action="/works"></form><form action="/bookmarks"></form><form action="/tags/search"></form><form action="https://example.com/works"></form>';
    const cleanup = installCrossoverLimit(doc, { href: origin } as Location, () => 1);
    for (const form of doc.querySelectorAll("form"))
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(doc.querySelectorAll("input")).toHaveLength(1);
    expect(new FormData(doc.querySelector("form")!).get(key)).toBe("F");
    cleanup();
    expect(doc.querySelectorAll("input")).toHaveLength(0);
  });

  it("hides only over-limit work and bookmark blurbs and restores them without clearing manually hidden works", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<div id="main"><ol class="work index">${blurb("work_1", 1)}${blurb("work_3", 3)}${blurb("work_4", 4)}${blurb("bookmark_9", 4)}<li id="work_5">Unknown fandoms</li></ol></div>`;
    applyHiddenWorks(doc, [4], () => {});
    applyFandomLimit(doc, 3);
    const hidden = () =>
      [...doc.querySelectorAll("li[id].ao3-tracker-fandom-limit-hidden")].map((el) => el.id);
    expect(hidden()).toEqual(["work_4", "bookmark_9"]);
    expect(readSearchPage(doc, `${origin}/works`, 3).works.map(({ id }) => id)).toEqual([1, 3, 5]);
    applyFandomLimit(doc, 1);
    expect(hidden()).toEqual(["work_3", "work_4", "bookmark_9"]);
    applyFandomLimit(doc, null);
    expect(hidden()).toEqual([]);
    expect(doc.querySelector("#work_4")!.classList.contains("ao3-tracker-work-hidden")).toBe(true);
    expect(doc.querySelectorAll(".ao3-tracker-hidden-work")).toHaveLength(1);
    expect(
      doc
        .querySelector(".ao3-tracker-hidden-work")!
        .classList.contains("ao3-tracker-fandom-limit-hidden"),
    ).toBe(false);
  });

  it("recognizes a saved search after applying the single-fandom default", () => {
    const saved = `${origin}/works?work_search[query]=hello`;
    const current = withCrossoverLimit(saved, 1);
    expect(savedSearchKey(saved, [], null, 1)).toBe(
      savedSearchKey(`${current}&page=2`, [], null, 1),
    );
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<button class="ao3-tracker-save-search"></button>';
    updateSavedSearchButton(doc, current, [saved], [], null, 1);
    expect(doc.querySelector("button")!.disabled).toBe(true);
  });

  it("defaults old preferences to unlimited and accepts only positive integer limits or null", () => {
    const preferences = { hiddenWorkIds: [], hiddenTags: [] };
    expect(browsingPreferencesSchema.parse(preferences).maxFandoms).toBeNull();
    for (const maxFandoms of [null, 1, 3])
      expect(browsingPreferencesSchema.parse({ ...preferences, maxFandoms }).maxFandoms).toBe(
        maxFandoms,
      );
    for (const maxFandoms of [0, -1, 1.5, "3", 2147483648])
      expect(browsingPreferencesSchema.safeParse({ ...preferences, maxFandoms }).success).toBe(
        false,
      );
  });
});
