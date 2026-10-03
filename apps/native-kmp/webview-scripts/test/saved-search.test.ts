import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  delete window.AndroidBridge;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([
  ["works", "work_search"],
  ["bookmarks", "bookmark_search"],
])("includes automatic exclusions when saving %s", async (path, namespace) => {
  vi.resetModules();
  delete window.__ao3Tracker;
  delete window.__ao3TrackerInitialized;
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  const url = `https://archiveofourown.org/${path}?${namespace}[excluded_tag_names]=Existing`;
  vi.spyOn(window.location, "href", "get").mockReturnValue(url);
  vi.spyOn(window.location, "replace").mockImplementation(() => {});
  document.body.innerHTML = `<div id="main"><h2 class="heading">Results</h2><form id="${path === "works" ? "work" : "bookmark"}-filters"></form></div>`;
  const postMessage = vi.fn();
  window.AndroidBridge = { postMessage };
  const { applyBrowsingState } = await import("~/ao3-tracking");
  applyBrowsingState(
    JSON.stringify({
      hiddenTags: ["existing", "Angst"],
      hiddenWorkIds: [],
      savedSearchUrls: [],
      languageFilterEnabled: false,
      maxFandoms: null,
    }),
  );

  const button = document.querySelector<HTMLButtonElement>(".ao3-tracker-save-search");
  if (!button) throw new Error("Missing saved-search button");
  button.click();

  const saved = postMessage.mock.calls
    .map(([message]) => JSON.parse(message))
    .find((message) => message.type === "saveSearch");
  expect(saved).toBeDefined();
  expect(new URL(saved.url).searchParams.get(`${namespace}[excluded_tag_names]`)).toBe(
    "Existing, Angst",
  );
  expect(saved.name).toContain("Exclude: Existing, Angst");
});
