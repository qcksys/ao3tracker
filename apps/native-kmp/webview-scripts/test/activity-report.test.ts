import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { chapterIndexHtml, workPageHtml } from "./fixtures";

let scrollListeners: EventListenerOrEventListenerObject[];

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a fixture value");
  return value;
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  delete window.__ao3Tracker;
  delete window.__ao3TrackerInitialized;
  scrollListeners = [];
  const addEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    if (type === "scroll") scrollListeners.push(listener);
    addEventListener(type, listener, options);
  });
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
});

afterEach(() => {
  for (const listener of scrollListeners) window.removeEventListener("scroll", listener);
  delete window.AndroidBridge;
  vi.restoreAllMocks();
});

it("replays fresh work data and unchanged progress without adding scroll listeners", async () => {
  document.body.innerHTML = workPageHtml;
  window.history.replaceState({}, "", "/works/10828137/chapters/24029673?scroll=50");
  const chapters = required(document.getElementById("chapters"));
  const chapterBounds = vi
    .spyOn(chapters, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 100, window.innerHeight * 2));
  const postMessage = vi.fn<(message: string) => void>();
  window.AndroidBridge = { postMessage };
  await import("~/ao3-tracking");
  const tracker = required(window.__ao3Tracker);
  expect(scrollListeners).toHaveLength(1);
  expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw).type)).toEqual([
    "workInfo",
    "workTags",
    "workChapterIndex",
    "browsingReady",
  ]);
  postMessage.mockClear();

  tracker.reportReadingActivity();
  const first = postMessage.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(first.map((message) => message.type)).toEqual([
    "workInfo",
    "workTags",
    "workChapterIndex",
    "scrollProgress",
  ]);
  expect(first[3]).toMatchObject({ chapterId: "24029673", scrollPercentage: 50 });
  postMessage.mockClear();

  required(document.querySelector("#workskin h2.title.heading")).textContent = "Updated title";
  required(document.querySelector("dd.rating.tags a")).textContent = "Updated rating";
  required(document.querySelector("#selected_id")).insertAdjacentHTML(
    "beforeend",
    '<option value="999">88. New chapter</option>',
  );
  tracker.reportReadingActivity();
  const second = postMessage.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(second.map((message) => message.type)).toEqual(first.map((message) => message.type));
  expect(second[0]).toMatchObject({ workName: "Updated title" });
  expect(second[1]).toMatchObject({ rating: { tag: "Updated rating" } });
  expect(second[2].chapters).toHaveLength(88);
  expect(second[3]).toMatchObject({ chapterId: "24029673", scrollPercentage: 50 });
  expect(scrollListeners).toHaveLength(1);

  postMessage.mockClear();
  chapterBounds.mockReturnValue(new DOMRect(0, 0, 100, window.innerHeight));
  window.dispatchEvent(new Event("scroll"));
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(JSON.parse(required(postMessage.mock.calls[0])[0])).toMatchObject({
    type: "scrollProgress",
    scrollPercentage: 100,
  });
});

it("replays a fresh chapter index without scroll tracking", async () => {
  document.body.innerHTML = chapterIndexHtml;
  window.history.replaceState({}, "", "/works/10828137/navigate");
  const postMessage = vi.fn<(message: string) => void>();
  window.AndroidBridge = { postMessage };
  await import("~/ao3-tracking");
  const tracker = required(window.__ao3Tracker);
  postMessage.mockClear();

  tracker.reportReadingActivity();
  required(document.querySelector("ol.chapter.index")).insertAdjacentHTML(
    "beforeend",
    '<li><a href="/works/10828137/chapters/999">4. New chapter</a></li>',
  );
  tracker.reportReadingActivity();
  const messages = postMessage.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(messages.map((message) => message.type)).toEqual(["workChapterIndex", "workChapterIndex"]);
  expect(messages[0].chapters).toHaveLength(3);
  expect(messages[1].chapters).toHaveLength(4);
  expect(scrollListeners).toHaveLength(0);
});

it("suggests applied filters when requesting a saved search from the native host", async () => {
  document.body.innerHTML =
    '<div id="main"><h2 class="heading">41 - 60 of 123 Works</h2><form id="work-filters"></form><li id="work_123"><h4 class="heading">Current page title</h4></li></div>';
  window.history.replaceState({}, "", "/tags/Fluff/works?work_search[complete]=T&page=3");
  const postMessage = vi.fn<(message: string) => void>();
  window.AndroidBridge = { postMessage };
  await import("~/ao3-tracking");
  postMessage.mockClear();
  required(document.querySelector<HTMLButtonElement>(".ao3-tracker-save-search")).click();
  expect(postMessage).toHaveBeenCalledOnce();
  expect(JSON.parse(required(postMessage.mock.calls[0])[0])).toEqual({
    type: "saveSearch",
    url: window.location.href,
    name: "Tag: Fluff · Complete works only",
  });
});

it("does not repeat list badges or save-search injection", async () => {
  document.body.innerHTML =
    '<div id="main"><h2 class="heading">Search</h2><form id="work-filters"></form><li id="work_123"></li></div>';
  window.history.replaceState({}, "", "/works?work_search[query]=test");
  const postMessage = vi.fn<(message: string) => void>();
  window.AndroidBridge = { postMessage };
  await import("~/ao3-tracking");
  const tracker = required(window.__ao3Tracker);
  expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw).type)).toEqual([
    "browsingReady",
    "listWorks",
  ]);
  expect(document.querySelectorAll("button.ao3-tracker-save-search")).toHaveLength(1);
  const html = document.body.innerHTML;
  postMessage.mockClear();

  tracker.reportReadingActivity();
  tracker.reportReadingActivity();
  expect(postMessage).not.toHaveBeenCalled();
  expect(document.body.innerHTML).toBe(html);
  expect(scrollListeners).toHaveLength(0);
});
