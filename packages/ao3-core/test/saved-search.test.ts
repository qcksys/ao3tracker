import { describe, expect, it } from "vite-plus/test";
import { suggestSavedSearchName } from "~/dom";

const origin = "https://archiveofourown.org";
const page = (html = "") => {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  return doc;
};

describe("suggestSavedSearchName", () => {
  it("lists applied filters without page ranges, result counts or work titles", () => {
    const doc = page(`<div id="main">
      <h2 class="heading">21 - 40 of 5,123 Works in Fluff</h2>
      <form id="work-filters">
        <label><input name="include_work_search[relationship_ids][]" value="123" type="checkbox" checked>
          <span class="indicator"></span><span>A/B (1,234)</span></label>
        <label><input name="work_search[complete]" value="T" type="radio" checked>Complete works only</label>
        <select name="work_search[sort_column]"><option value="kudos_count">Kudos</option></select>
      </form>
      <ol><li id="work_1"><h4 class="heading">Current work title</h4></li></ol>
    </div>`);
    const href = `${origin}/tags/Fluff/works?include_work_search[relationship_ids][]=123&work_search[complete]=T&work_search[words_from]=10000&work_search[excluded_tag_names]=Angst&work_search[sort_column]=kudos_count`;
    const name =
      "Tag: Fluff · Include: A/B · Complete works only · Words from: 10000 · Exclude: Angst · Sort by: Kudos";
    expect(suggestSavedSearchName(doc, `${href}&page=2&utf8=x&commit=Sort+and+Filter`)).toBe(name);
    doc.querySelector("h2")!.textContent = "41 - 60 of 5,999 Works in Fluff";
    doc.querySelector("h4")!.textContent = "Another work title";
    expect(suggestSavedSearchName(doc, `${href}&page=3&work_search[page]=3#main`)).toBe(name);
  });

  it("distinguishes included and excluded bookmark and work tags", () => {
    const doc = page(`<form id="bookmark-filters">
      <label><input type="checkbox" name="include_bookmark_search[tag_ids][]" value="11">Favorite <span class="count">(42)</span></label>
      <label><input type="checkbox" name="exclude_bookmark_search[freeform_ids][]" value="22">Angst (9)</label>
      <label><input type="checkbox" name="bookmark_search[rec]" value="1">Recs only</label>
    </form>`);
    const href = `${origin}/users/reader/bookmarks?include_bookmark_search[tag_ids][]=11&exclude_bookmark_search[freeform_ids][]=22&bookmark_search[excluded_bookmark_tag_names]=Private&bookmark_search[rec]=1&bookmark_search[with_notes]=0&bookmark_search[page]=4`;
    expect(suggestSavedSearchName(doc, href)).toBe(
      "User: reader · Include bookmark tags: Favorite · Exclude: Angst · Exclude bookmark tags: Private · Recs only",
    );
  });

  it("names the saved URL's filters even when form edits have not been submitted", () => {
    const doc = page(`<form id="work-filters">
      <input name="work_search[query]" value="unsent text">
      <label><input type="checkbox" name="include_work_search[fandom_ids][]" value="1">First fandom (5)</label>
      <label><input type="checkbox" name="include_work_search[fandom_ids][]" value="2" checked>Unsent fandom (9)</label>
      <select name="work_search[language_id]"><option value="en">English</option><option value="fr" selected>Français</option></select>
    </form>`);
    expect(
      suggestSavedSearchName(
        doc,
        `${origin}/works?work_search[query]=applied&include_work_search[fandom_ids][]=1&work_search[language_id]=en`,
      ),
    ).toBe("Search: applied · Include: First fandom · Language: English");
  });

  it.each(["works", "bookmarks"])(
    "uses the advanced %s filter summary and retains default exclusions",
    (type) => {
      const doc = page(`<div id="main"><h2 class="heading">Search Results</h2>
      <h4 class="heading">You searched for: Tags: Fluff Complete Language: <span lang="en">English</span></h4>
      <h3 class="heading">1,234 Found</h3>
      <ol><li><h4 class="heading">Work on the current page</h4></li></ol></div>`);
      const namespace = type === "works" ? "work_search" : "bookmark_search";
      expect(
        suggestSavedSearchName(
          doc,
          `${origin}/${type}/search?${namespace}[freeform_ids][]=123&${namespace}[language_id]=en&${namespace}[excluded_tag_names]=Angst&page=4`,
        ),
      ).toBe("Tags: Fluff Complete Language: English · Exclude: Angst");
    },
  );

  it("keeps path scopes readable and does not duplicate query scopes", () => {
    expect(
      suggestSavedSearchName(
        page(),
        `${origin}/collections/Favorites/tags/A*s*B%20*a*%20C/works?tag_id=A*s*B+*a*+C&work_search[date_from]=2026-01-01`,
      ),
    ).toBe("Collection: Favorites · Tag: A/B & C · Updated from: 2026-01-01");
  });

  it("falls back to URL filters on an empty result page without controls", () => {
    expect(
      suggestSavedSearchName(
        page('<div id="main"><h2 class="heading">0 Works</h2></div>'),
        `${origin}/works/search?work_search[query]=hello&work_search[complete]=F&work_search[crossover]=F&work_search[single_chapter]=0&work_search[title]=`,
      ),
    ).toBe("Search: hello · Works in progress only · Exclude crossovers");
  });

  it("uses a stable fallback for an unfiltered search and caps names to the storage limit", () => {
    expect(
      suggestSavedSearchName(
        page('<div id="main"><h2 class="heading">21 - 40 of 999 Works</h2></div>'),
        `${origin}/works?page=2&work_search[page]=2&utf8=x&commit=Search`,
      ),
    ).toBe("AO3 search");
    const name = suggestSavedSearchName(
      page(),
      `${origin}/works?work_search[query]=${"long ".repeat(100)}`,
    );
    expect(name.startsWith("Search: long")).toBe(true);
    expect(name).toHaveLength(191);
  });
});
