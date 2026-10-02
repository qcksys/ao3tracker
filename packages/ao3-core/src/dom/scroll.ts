import type { ScrollProgressMessage } from "../schemas/messages";
import { computeChapterScrollPercentage, extractChapterId, findNextChapterButton } from "./extract";

export function observeChapterProgress(
  doc: Document,
  win: Window & typeof globalThis,
  onProgress: (message: ScrollProgressMessage) => void,
): () => void {
  const report = (): void => {
    const message = publishScrollPercentage(doc, win);
    if (message) onProgress(message);
  };
  win.addEventListener("scroll", report, { passive: true });
  win.addEventListener("resize", report);
  const next = findNextChapterButton(doc);
  const observer = next ? new win.IntersectionObserver(report) : null;
  if (next) observer?.observe(next);
  report();
  return () => {
    win.removeEventListener("scroll", report);
    win.removeEventListener("resize", report);
    observer?.disconnect();
  };
}

/**
 * Returns the next scroll message to emit when the user scrolls, or null if
 * there's no change to publish (no `#chapters` element, NaN, or same rounded
 * percentage as the URL query already records).
 *
 * Side effect: rewrites `location.search` via `history.replaceState` so the
 * AO3 page URL records the most recent percentage. The native app uses this
 * to round-trip scroll restore via `?scrollTo=`.
 */
export function publishScrollPercentage(doc: Document, win: Window): ScrollProgressMessage | null {
  const percentage = computeChapterScrollPercentage(doc, win);
  if (percentage === null || Number.isNaN(percentage)) return null;

  const rounded = Math.floor(percentage).toString();
  const url = new URL(win.location.href);
  if (url.searchParams.get("scroll") === rounded) return null;

  url.searchParams.set("scroll", rounded);
  win.history.replaceState({}, "", url.toString());

  return {
    type: "scrollProgress",
    url: url.toString(),
    chapterId: extractChapterId(doc, win.location),
    scrollPercentage: Number.parseInt(rounded, 10),
  };
}

/**
 * Read the `scrollTo` query param, scroll to that percentage inside #chapters,
 * and clear the param. Returns true if the param was present, false otherwise.
 */
export function consumeScrollToParam(doc: Document, win: Window): boolean {
  const url = new URL(win.location.href);
  const scrollToParam = url.searchParams.get("scrollTo");
  if (!scrollToParam) return false;

  const scrollPercent = Number.parseInt(scrollToParam, 10);
  if (Number.isNaN(scrollPercent)) return false;

  url.searchParams.delete("scrollTo");
  url.searchParams.delete("_t");
  win.history.replaceState({}, "", url.toString());

  const performScroll = (): void => {
    const chaptersElement = doc.getElementById("chapters");
    if (!chaptersElement) return;
    const height = chaptersElement.getBoundingClientRect().height;
    const viewportHeight = win.innerHeight ?? 0;
    const targetBottom = chaptersElement.offsetTop + (height * scrollPercent) / 100;
    const target = Math.max(0, targetBottom - viewportHeight);
    win.scrollTo(0, target);
  };

  if (doc.readyState === "complete") {
    win.setTimeout(performScroll, 150);
  } else {
    win.addEventListener("load", () => win.setTimeout(performScroll, 150));
  }
  return true;
}
