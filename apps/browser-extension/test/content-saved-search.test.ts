// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/storage", () => ({
  browsingPreferencesItem: { watch: () => vi.fn() },
  savedSearchesItem: {
    watch: () => vi.fn(),
    getValue: async () => [
      {
        id: "existing",
        name: "My search",
        url: "https://archiveofourown.org/works",
        deleted: false,
        updatedAt: "2026-10-03T00:00:00Z",
      },
    ],
  },
}));

let cleanup: (() => void)[];

beforeEach(() => {
  vi.resetModules();
  cleanup = [];
  Reflect.deleteProperty(window, "__ao3TrackerInitialized");
});

afterEach(() => {
  for (const stop of cleanup) stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["works", "work_search", "saveSearch"],
  ["bookmarks", "bookmark_search", "saveSearch"],
  ["works", "work_search", "updateSavedSearch"],
  ["bookmarks", "bookmark_search", "updateSavedSearch"],
])("includes automatic exclusions for %s (%s, %s)", async (path, namespace, kind) => {
  const url = `https://archiveofourown.org/${path}?${namespace}[excluded_tag_names]=Existing`;
  document.body.innerHTML = `<div id="main"><h2 class="heading">Results</h2><form id="${path === "works" ? "work" : "bookmark"}-filters"></form></div>`;
  vi.spyOn(window.location, "href", "get").mockReturnValue(url);
  const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
  const sendMessage = vi.fn().mockImplementation(async (message: { kind: string }) =>
    message.kind === "getBrowsingState"
      ? {
          kind: "browsingState",
          state: {
            hiddenTags: ["existing", "Angst"],
            hiddenWorkIds: [],
            hiddenWorkTitles: {},
            savedSearchUrls: [],
            hideCaughtUp: false,
            languageFilterEnabled: false,
            searchLanguage: "en",
            maxFandoms: null,
          },
        }
      : { kind: "ok" },
  );
  vi.stubGlobal("browser", { runtime: { sendMessage } });
  type Context = { onInvalidated: (stop: () => void) => void };
  let main: ((ctx: Context) => Promise<void>) | undefined;
  vi.stubGlobal("defineContentScript", (definition: { main: NonNullable<typeof main> }) => {
    main = definition.main;
    return definition;
  });
  await import("../entrypoints/content");
  if (!main) throw new Error("Content script was not registered");
  await main({ onInvalidated: (stop) => cleanup.push(stop) });
  await vi.waitFor(() => expect(replace).toHaveBeenCalled());

  document.querySelector<HTMLButtonElement>(".ao3-tracker-save-search")!.click();
  await vi.waitFor(() => expect(document.querySelector("dialog")).not.toBeNull());
  if (kind === "updateSavedSearch") {
    document.querySelector<HTMLButtonElement>("[data-toggle]")!.click();
    const select = document.querySelector("select")!;
    select.value = "existing";
    select.dispatchEvent(new Event("change"));
  }
  document.querySelector("dialog form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector("dialog")).toBeNull());

  const saved = sendMessage.mock.calls.find(([message]) => message.kind === kind)?.[0];
  expect(saved).toBeDefined();
  expect(new URL(saved.url).searchParams.get(`${namespace}[excluded_tag_names]`)).toBe(
    "Existing, Angst",
  );
  if (kind === "saveSearch") expect(saved.name).toContain("Exclude: Existing, Angst");
  else expect(saved.id).toBe("existing");
});
