import { expect, it, vi } from "vite-plus/test";

it("applies native crossover limits to results, forms and URLs, and restores results when cleared", async () => {
  vi.resetModules();
  delete window.__ao3Tracker;
  delete window.__ao3TrackerInitialized;
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  const href = vi
    .spyOn(window.location, "href", "get")
    .mockReturnValue("https://archiveofourown.org/works/search");
  const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
  document.body.innerHTML =
    '<form action="/works/search"><input name="work_search[query]" value="hello"></form><li id="work_123"><h5 class="fandoms"><a class="tag">A</a><a class="tag">B</a><a class="tag">C</a><a class="tag">D</a></h5></li>';
  const { applyBrowsingState } = await import("~/ao3-tracking");
  const preferences = {
    hiddenTags: [],
    hiddenWorkIds: [],
    savedSearchUrls: [],
    languageFilterEnabled: false,
    searchLanguage: "en",
    maxFandoms: 3,
  };
  const blurb = document.querySelector("#work_123");
  const form = document.querySelector("form");
  try {
    if (!blurb || !form) throw new Error("Expected result and search form");
    applyBrowsingState(JSON.stringify(preferences));
    expect(blurb.classList.contains("ao3-tracker-fandom-limit-hidden")).toBe(true);
    expect(replace).not.toHaveBeenCalled();
    applyBrowsingState(JSON.stringify({ ...preferences, maxFandoms: undefined }));
    expect(blurb.classList.contains("ao3-tracker-fandom-limit-hidden")).toBe(false);
    applyBrowsingState(JSON.stringify({ ...preferences, maxFandoms: 1 }));
    form.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(new FormData(form).getAll("work_search[crossover]")).toEqual(["F"]);
    applyBrowsingState(JSON.stringify(preferences));
    form.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(new FormData(form).has("work_search[crossover]")).toBe(false);
    href.mockReturnValue("https://archiveofourown.org/tags/Fluff/works?page=2");
    applyBrowsingState(JSON.stringify({ ...preferences, maxFandoms: 1 }));
    const redirected = replace.mock.calls[0]?.[0];
    if (!redirected) throw new Error("Expected filtered navigation");
    expect(new URL(redirected).searchParams.get("work_search[crossover]")).toBe("F");
  } finally {
    vi.restoreAllMocks();
  }
});
