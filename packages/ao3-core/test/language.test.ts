import { describe, expect, it } from "vite-plus/test";
import {
  installSearchLanguage,
  savedSearchKey,
  withDefaultHiddenTags,
  withSearchLanguage,
} from "~/dom";
import { browsingPreferencesSchema } from "~/schemas";
import languages from "~/languages.json";

const origin = "https://archiveofourown.org";

describe("search language", () => {
  it.each([
    ["/works", "work_search"],
    ["/works/search", "work_search"],
    ["/tags/Fluff/works", "work_search"],
    ["/users/reader/works", "work_search"],
    ["/collections/test/works", "work_search"],
    ["/bookmarks", "bookmark_search"],
    ["/bookmarks/search", "bookmark_search"],
    ["/users/reader/bookmarks", "bookmark_search"],
    ["/collections/test/bookmarks", "bookmark_search"],
    ["/tags/Fluff/bookmarks", "bookmark_search"],
  ])(
    "filters %s and replaces other language choices without a redirect loop",
    (path, namespace) => {
      const href = `${origin}${path}?${namespace}[query]=hello&${namespace}[language_id]=fr&page=3#results`;
      const filtered = withSearchLanguage(withDefaultHiddenTags(href, ["Angst"]), "ptBR");
      const url = new URL(filtered);
      expect(url.searchParams.getAll(`${namespace}[language_id]`)).toEqual(["ptBR"]);
      expect(url.searchParams.get(`${namespace}[query]`)).toBe("hello");
      expect(url.searchParams.get(`${namespace}[excluded_tag_names]`)).toBe("Angst");
      expect(url.searchParams.get("page")).toBe("3");
      expect(url.hash).toBe("#results");
      expect(withSearchLanguage(filtered, "ptBR")).toBe(filtered);
      expect(withSearchLanguage(filtered, null)).toBe(filtered);
    },
  );

  it("filters unfiltered listings and normalizes duplicate language parameters", () => {
    expect(
      new URL(withSearchLanguage(`${origin}/tags/Fluff/works`, "en")).searchParams.get(
        "work_search[language_id]",
      ),
    ).toBe("en");
    const href = `${origin}/works?work_search[language_id]=en&work_search[language_id]=fr`;
    expect(
      new URL(withSearchLanguage(href, "en")).searchParams.getAll("work_search[language_id]"),
    ).toEqual(["en"]);
    expect(withSearchLanguage(`${origin}/works`, null)).toBe(`${origin}/works`);
  });

  it.each([
    "/works/123",
    "/works/123/chapters/456",
    "/tags/search",
    "/people/search",
    "/works/search",
    "/bookmarks/search",
    "/",
  ])("leaves non-results alone: %s", (path) => {
    expect(withSearchLanguage(`${origin}${path}`, "en")).toBe(`${origin}${path}`);
  });

  it("does not alter other hosts or insecure URLs", () => {
    for (const href of ["https://example.com/works?q=test", "http://archiveofourown.org/works"]) {
      expect(withSearchLanguage(href, "en")).toBe(href);
    }
  });

  it.each(["work", "bookmark"])(
    "injects one %s language on GET submissions and stops when disabled",
    (kind) => {
      const doc = document.implementation.createHTMLDocument();
      const key = `${kind}_search[language_id]`;
      doc.body.innerHTML = `<form action="/${kind}s/search"><select name="${key}"><option value="fr">French</option></select><input name="${kind}_search[query]" value="hello"></form>`;
      let language: string | null = "en";
      const cleanup = installSearchLanguage(doc, { href: origin } as Location, () => language);
      const form = doc.querySelector("form")!;
      const submit = () =>
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      submit();
      expect(new FormData(form).getAll(key)).toEqual(["en"]);
      expect(new FormData(form).get(`${kind}_search[query]`)).toBe("hello");
      language = "ptPT";
      submit();
      submit();
      expect(new FormData(form).getAll(key)).toEqual(["ptPT"]);
      language = null;
      submit();
      expect(new FormData(form).getAll(key)).toEqual(["fr"]);
      expect(form.querySelector("select")!.disabled).toBe(false);
      cleanup();
    },
  );

  it("handles quick search, ignores unrelated and POST forms, and removes injected fields on cleanup", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML =
      '<form action="/works/search"></form><form action="/works" method="post"></form><form action="/tags/search"></form><form action="https://example.com/works"></form>';
    const cleanup = installSearchLanguage(doc, { href: origin } as Location, () => "en");
    for (const form of doc.querySelectorAll("form"))
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(doc.querySelectorAll("input")).toHaveLength(1);
    expect(new FormData(doc.querySelector("form")!).get("work_search[language_id]")).toBe("en");
    cleanup();
    expect(doc.querySelectorAll("input")).toHaveLength(0);
  });

  it("matches saved searches after applying the enabled language", () => {
    const saved = `${origin}/works?work_search[query]=hello&work_search[language_id]=fr`;
    const current = withSearchLanguage(saved, "en");
    expect(savedSearchKey(saved, [], "en")).toBe(savedSearchKey(`${current}&page=2`, [], "en"));
    expect(savedSearchKey(saved)).not.toBe(savedSearchKey(current));
  });

  it("upgrades older preferences with filtering off and validates AO3 language codes", () => {
    expect(
      browsingPreferencesSchema.parse({ hiddenTags: ["Angst"], hiddenWorkIds: [123] }),
    ).toEqual({
      hiddenTags: ["Angst"],
      hiddenWorkIds: [123],
      searchLanguage: "en",
      languageFilterEnabled: false,
      maxFandoms: null,
    });
    for (const { code } of languages) {
      expect(
        browsingPreferencesSchema.safeParse({
          hiddenTags: [],
          hiddenWorkIds: [],
          searchLanguage: code,
        }).success,
      ).toBe(true);
    }
    expect(new Set(languages.map(({ code }) => code)).size).toBe(languages.length);
    expect(
      browsingPreferencesSchema.safeParse({
        hiddenTags: [],
        hiddenWorkIds: [],
        searchLanguage: "invalid",
      }).success,
    ).toBe(false);
  });
});
