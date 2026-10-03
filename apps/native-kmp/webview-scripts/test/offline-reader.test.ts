import { computeChapterScrollPercentage } from "@qcksys/ao3tracker-core/dom";
import type { OfflineReaderMessage, OfflineReaderOptions } from "@qcksys/ao3tracker-core/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { installOfflineReader } from "~/offline-reader";

vi.mock("@qcksys/ao3tracker-core/dom", () => ({ computeChapterScrollPercentage: vi.fn() }));

const options: OfflineReaderOptions = {
  token: "active",
  canonicalUrl: "https://archiveofourown.org/works/123/chapters/456",
  workId: "123",
  chapterId: "456",
  scrollPercentage: 50,
  fragment: "",
};
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<div id="chapters"><p>Story</p><a id="next" href="/works/123/chapters/789">Next</a><a id="anchor" href="#notes">Notes</a><p id="notes">Notes</p></div><select id="selected_id"><option value="456">One</option><option value="789">Two</option></select>';
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 16),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 100,
    height: 2000,
    left: 0,
    width: 400,
    right: 400,
    bottom: 2100,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  });
  vi.mocked(computeChapterScrollPercentage).mockReturnValue(80);
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function install(overrides: Partial<OfflineReaderOptions> = {}) {
  const messages: OfflineReaderMessage[] = [];
  stop = installOfflineReader(document, window, { ...options, ...overrides }, (message) =>
    messages.push(message),
  );
  return messages;
}

describe("offline reader", () => {
  it("restores before becoming ready and emits no stored metadata or initial progress", async () => {
    const messages = install();
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(100);
    expect(window.scrollTo).toHaveBeenCalledWith(0, Math.max(0, 1100 - window.innerHeight));
    expect(messages).toEqual([{ type: "offlineReady", token: "active" }]);
  });

  it("reports user scrolling but suppresses programmatic restoration and resize progress", async () => {
    const messages = install();
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(messages).toHaveLength(1);
    document.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(messages.at(-1)).toEqual({
      type: "offlineProgress",
      token: "active",
      scrollPercentage: 80,
    });
    vi.mocked(computeChapterScrollPercentage).mockReturnValue(100);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(messages).toHaveLength(2);
  });

  it("keeps AO3 URLs canonical and intercepts chapter links and the chapter selector", async () => {
    const messages = install();
    await vi.advanceTimersByTimeAsync(100);
    const link = document.getElementById("next");
    if (!link) throw new Error("Missing next-chapter fixture");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(messages.at(-1)).toEqual({
      type: "offlineNavigate",
      token: "active",
      url: "https://archiveofourown.org/works/123/chapters/789",
    });
    const select = document.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Missing chapter-selector fixture");
    select.value = "789";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(messages.filter((m) => m.type === "offlineNavigate")).toHaveLength(2);
  });

  it("restores the last read percentage after a layout change without publishing synthetic progress", async () => {
    const messages = install();
    await vi.advanceTimersByTimeAsync(100);
    document.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      height: 4000,
      left: 0,
      width: 800,
      right: 800,
      bottom: 4100,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    vi.mocked(computeChapterScrollPercentage).mockReturnValue(100);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, Math.max(0, 3300 - window.innerHeight));
    expect(messages).toHaveLength(2);
    expect(messages.at(-1)).toMatchObject({ type: "offlineProgress", scrollPercentage: 80 });
  });

  it("responds to CSS appearance changes without reloading or inventing reading progress", async () => {
    const appearance = window.matchMedia("(prefers-color-scheme: dark)");
    vi.spyOn(window, "matchMedia").mockReturnValue(appearance);
    const messages = install();
    await vi.advanceTimersByTimeAsync(100);
    document.dispatchEvent(new Event("touchstart"));
    appearance.dispatchEvent(new Event("change"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(messages).toEqual([{ type: "offlineReady", token: "active" }]);
    stop?.();
    appearance.dispatchEvent(new Event("change"));
    await vi.advanceTimersByTimeAsync(150);
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("preserves in-page anchors without replacing the document", async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const messages = install({ fragment: "notes" });
    await vi.advanceTimersByTimeAsync(100);
    expect(scroll).toHaveBeenCalledTimes(1);
    const anchor = document.getElementById("anchor");
    if (!anchor) throw new Error("Missing anchor fixture");
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(messages.some((m) => m.type === "offlineNavigate")).toBe(false);
  });

  it("does not report completion merely because a chapter link or selector was used", async () => {
    vi.mocked(computeChapterScrollPercentage).mockReturnValue(100);
    const messages = install({ scrollPercentage: 0 });
    await vi.advanceTimersByTimeAsync(100);
    document.dispatchEvent(new Event("pointerdown"));
    document.getElementById("next")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const select = document.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Missing chapter selector");
    select.value = "789";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(messages.filter((message) => message.type === "offlineNavigate")).toHaveLength(2);
    expect(messages.some((message) => message.type === "offlineProgress")).toBe(false);
  });

  it("stops pending restoration and listeners when the document closes", async () => {
    const messages = install();
    stop?.();
    await vi.advanceTimersByTimeAsync(200);
    document.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(150);
    expect(messages).toEqual([]);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
