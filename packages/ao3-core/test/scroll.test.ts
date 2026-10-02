import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { computeChapterScrollPercentage, getWorkInfo } from "../src/dom/extract";
import { observeChapterProgress, publishScrollPercentage } from "../src/dom/scroll";
import { scrollProgressMessageSchema } from "../src/schemas/messages";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/works/123/chapters/456");
});

function chapterWithNextButton() {
  document.body.innerHTML =
    '<ul><li class="chapter next"><a href="/works/123/chapters/789">Next Chapter →</a></li></ul><div id="chapters"></div><div id="feedback"><ul class="actions"><li><a href="/works/123/chapters/789#workskin">Next Chapter →</a></li></ul></div>';
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(600);
  vi.spyOn(document.getElementById("chapters")!, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 600, 1600),
  );
  const button = document.querySelector<HTMLAnchorElement>("#feedback a")!;
  const bounds = vi.spyOn(button, "getBoundingClientRect");
  return { button, bounds };
}

it("observes progress on load and layout changes, and releases its listeners", () => {
  const { button, bounds } = chapterWithNextButton();
  bounds.mockReturnValue(new DOMRect(20, 900, 120, 24));
  let intersectionChanged = () => {};
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: () => void) {
        intersectionChanged = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const report = vi.fn();
  const stop = observeChapterProgress(document, window, report);
  try {
    expect(observe).toHaveBeenCalledWith(button);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ scrollPercentage: 50 }));
    bounds.mockReturnValue(new DOMRect(20, 799, 120, 24));
    intersectionChanged();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ scrollPercentage: 100 }));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(report).toHaveBeenCalledTimes(2);
  } finally {
    stop();
  }
  expect(disconnect).toHaveBeenCalledOnce();
  bounds.mockReturnValue(new DOMRect(20, 900, 120, 24));
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(report).toHaveBeenCalledTimes(2);
});

it("reports 100 percent as soon as the bottom Next Chapter button enters the viewport", () => {
  const { bounds } = chapterWithNextButton();
  bounds.mockReturnValue(new DOMRect(20, 799, 120, 24));
  expect(computeChapterScrollPercentage(document, window)).toBe(100);
  expect(publishScrollPercentage(document, window)).toMatchObject({
    chapterId: "456",
    scrollPercentage: 100,
  });
  expect(publishScrollPercentage(document, window)).toBeNull();
});

it.each([
  [20, 800, 120, 24],
  [20, -24, 120, 24],
  [600, 100, 120, 24],
  [-120, 100, 120, 24],
  [20, 100, 0, 0],
])(
  "keeps measured progress when the bottom button is outside the viewport or has no size (%s, %s, %s, %s)",
  (x, y, width, height) => {
    const { bounds } = chapterWithNextButton();
    bounds.mockReturnValue(new DOMRect(x, y, width, height));
    expect(computeChapterScrollPercentage(document, window)).toBe(50);
  },
);

it("ignores the top Next Chapter link and a hidden bottom button", () => {
  const { button, bounds } = chapterWithNextButton();
  vi.spyOn(document.querySelector(".chapter.next a")!, "getBoundingClientRect").mockReturnValue(
    new DOMRect(20, 100, 120, 24),
  );
  bounds.mockReturnValue(new DOMRect(20, 100, 120, 24));
  button.style.visibility = "hidden";
  expect(computeChapterScrollPercentage(document, window)).toBe(50);
  button.remove();
  expect(computeChapterScrollPercentage(document, window)).toBe(50);
});

it("includes the same chapter identity as workInfo on the ordinary work URL", () => {
  window.history.replaceState({}, "", "/works/123");
  document.body.innerHTML =
    '<select id="selected_id"><option value="456" selected>1</option></select><div id="chapters"></div>';
  const chapters = document.getElementById("chapters")!;
  vi.spyOn(chapters, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 1000));
  const info = getWorkInfo(document, window.location);
  const progress = publishScrollPercentage(document, window);
  expect(info.chapterId).toBe("456");
  expect(progress?.chapterId).toBe(info.chapterId);
  expect(scrollProgressMessageSchema.parse(progress).chapterId).toBe("456");
});

it("continues accepting events from clients without chapterId", () => {
  expect(
    scrollProgressMessageSchema.parse({
      type: "scrollProgress",
      url: "https://archiveofourown.org/works/123",
      scrollPercentage: 20,
    }).chapterId,
  ).toBeUndefined();
});
