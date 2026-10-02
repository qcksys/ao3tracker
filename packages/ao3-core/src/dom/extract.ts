import type {
  ChapterInfo,
  TagInfo,
  WorkChapterIndexMessage,
  WorkInfoMessage,
  WorkTagsMessage,
} from "../schemas/messages";
import {
  normalizeWorkSummary,
  WORK_SUMMARY_BLOCK_ELEMENTS,
  WORK_SUMMARY_SELECTOR,
} from "../work-summary";
import { classifyAo3Url, normalizeWhitespace } from "./utils";

/**
 * Extract per-tag-type info from the work meta block.
 */
function getArrayOfTagsFromAnchorElements(doc: Document, type: string): TagInfo[] {
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(`.work.meta.group dd.${type}.tags a`),
  );
  return anchors.map((anchor) => ({
    tag: normalizeWhitespace(anchor.textContent),
    href: anchor.getAttribute("href"),
  }));
}

export function extractChapterId(doc: Document, location: Location): string | null {
  const urlMatch = location.pathname.match(/\/chapters\/(\d+)/);
  if (urlMatch?.[1]) return urlMatch[1];

  const dropdown = doc.querySelector<HTMLSelectElement>("#selected_id");
  if (dropdown?.value) return dropdown.value;

  const chapterLink = doc.querySelector<HTMLAnchorElement>("#chapters div.chapter h3.title a");
  if (chapterLink) {
    const linkMatch = chapterLink.href.match(/\/chapters\/(\d+)/);
    if (linkMatch?.[1]) return linkMatch[1];
  }

  return null;
}

export function getWorkInfo(doc: Document, location: Location): WorkInfoMessage {
  const text = (selector: string): string | null =>
    doc.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? null;
  const attr = (selector: string, name: string): string | null =>
    doc.querySelector<HTMLElement>(selector)?.getAttribute(name) ?? null;
  const numericText = (selector: string): string | null => {
    const value = text(selector);
    return value ? value.replace(/,/g, "") : null;
  };

  const lastUpdated =
    text(".work.meta.group .stats dd.status") ?? text(".work.meta.group .stats dd.published");

  const summary = doc.querySelector(WORK_SUMMARY_SELECTOR);
  const summaryCopy = summary ? doc.importNode(summary, true) : null;
  for (const block of summaryCopy?.querySelectorAll(WORK_SUMMARY_BLOCK_ELEMENTS) ?? []) {
    block.before(" ");
    block.after(" ");
  }

  return {
    type: "workInfo",
    url: location.href,
    workName: text("#workskin h2.title.heading"),
    workLastUpdated: lastUpdated,
    chapterId: extractChapterId(doc, location),
    chapterName: text("#chapters div.chapter div.chapter.preface.group h3.title"),
    chapterNumber: doc.querySelector<HTMLElement>("#chapters div.chapter")?.id ?? null,
    totalChapters: text(".work.meta.group .stats dd.chapters"),
    authorUrl: attr("#workskin .byline.heading a", "href"),
    authorName: text("#workskin .byline.heading a"),
    summary: normalizeWorkSummary(summaryCopy?.textContent),
    wordCount: numericText(".work.meta.group .stats dd.words"),
    language: text(".work.meta.group dd.language"),
    kudos: numericText(".work.meta.group .stats dd.kudos"),
    hits: numericText(".work.meta.group .stats dd.hits"),
    bookmarks: numericText(".work.meta.group .stats dd.bookmarks a"),
    comments: numericText(".work.meta.group .stats dd.comments"),
    downloadPath: (() => {
      const href = attr("li.download ul a", "href");
      if (!href) return null;
      try {
        return new URL(href, "https://archiveofourown.org").pathname.replace(
          /\.(azw3|epub|mobi|pdf|html)$/,
          "",
        );
      } catch {
        return null;
      }
    })(),
    downloadUpdatedAt: (() => {
      const href = attr("li.download ul a", "href");
      if (!href) return null;
      try {
        const url = new URL(href, "https://archiveofourown.org");
        const updatedAt = url.searchParams.get("updated_at");
        if (!updatedAt) return null;
        const num = Number.parseInt(updatedAt, 10);
        if (Number.isNaN(num)) return null;
        return new Date(num * 1000).toISOString();
      } catch {
        return null;
      }
    })(),
    isPrivate: !!doc.querySelector('img[src*="lockblue.png"], img[alt="(Restricted)"]'),
  };
}

export function getWorkTagInfo(doc: Document, location: Location): WorkTagsMessage {
  const lastUpdated =
    doc.querySelector<HTMLElement>(".work.meta.group .stats dd.status")?.textContent?.trim() ??
    doc.querySelector<HTMLElement>(".work.meta.group .stats dd.published")?.textContent?.trim() ??
    null;

  return {
    type: "workTags",
    url: location.href,
    workLastUpdated: lastUpdated,
    rating: getArrayOfTagsFromAnchorElements(doc, "rating")[0],
    warning: getArrayOfTagsFromAnchorElements(doc, "warning"),
    category: getArrayOfTagsFromAnchorElements(doc, "category"),
    fandom: getArrayOfTagsFromAnchorElements(doc, "fandom"),
    relationship: getArrayOfTagsFromAnchorElements(doc, "relationship"),
    character: getArrayOfTagsFromAnchorElements(doc, "character"),
    freeform: getArrayOfTagsFromAnchorElements(doc, "freeform"),
  };
}

export function getWorkChapterIndex(doc: Document, location: Location): WorkChapterIndexMessage {
  const items = Array.from(doc.querySelectorAll<HTMLLIElement>("#main ol.chapter.index.group li"));
  const chapters: ChapterInfo[] = items.map((el) => {
    const anchor = el.querySelector<HTMLAnchorElement>("a");
    const date = el.querySelector<HTMLSpanElement>("span.datetime");
    return {
      chapterDate: normalizeWhitespace(date?.textContent),
      chapterNumber: normalizeWhitespace(anchor?.textContent),
      chapterUrl: anchor?.getAttribute("href") ?? null,
    };
  });

  return {
    type: "workChapterIndex",
    url: location.href,
    authorUrl:
      doc
        .querySelector<HTMLAnchorElement>("#main .heading a[rel='author']")
        ?.getAttribute("href") ?? null,
    chapters,
  };
}

export function getWorkChapterSelect(
  doc: Document,
  location: Location,
): WorkChapterIndexMessage | null {
  const select = doc.querySelector<HTMLSelectElement>("#selected_id");
  if (!select) return null;

  const options = Array.from(select.querySelectorAll<HTMLOptionElement>("option"));
  if (options.length === 0) return null;

  const workIdMatch = location.pathname.match(/\/works\/(\d+)/);
  const workId = workIdMatch?.[1];
  if (!workId) return null;

  return {
    type: "workChapterIndex",
    url: location.href,
    authorUrl:
      doc.querySelector<HTMLAnchorElement>("#workskin .byline.heading a")?.getAttribute("href") ??
      null,
    chapters: options.map((option) => ({
      chapterDate: null,
      chapterNumber: normalizeWhitespace(option.textContent),
      chapterUrl: option.value ? `/works/${workId}/chapters/${option.value}` : null,
    })),
  };
}

/**
 * True when the page is an AO3 listing the user can filter/search (a works or
 * bookmarks listing, a tag's works page, or a search results page) — i.e.
 * somewhere a "Save this search" action makes sense.
 *
 * `classifyAo3Url().isList` is a negative catch-all (true for the homepage,
 * dashboards, etc.), so it's only a coarse gate. We additionally require the
 * "Sort and Filter" sidebar form OR a results list to be present.
 */
export function isFilterableListPage(doc: Document, location: Location): boolean {
  if (!classifyAo3Url(location.href).isList) return false;
  return (
    doc.querySelector(
      "form#work-filters, form#bookmark-filters, form#work_search, form#bookmark_search",
    ) !== null ||
    /\/(works|bookmarks)\/search$/.test(new URL(location.href).pathname) ||
    doc.querySelector('li[id^="work_"], li[id^="bookmark_"]') !== null
  );
}

/** Default label for the injected save button (and the target to revert to). */
export const SAVE_SEARCH_LABEL = "Save this search";

/**
 * Inject a "Save this search" button into an AO3 filterable list page. The
 * button calls `onSave` with the current `location.href` (captured at click
 * time, since AO3 mutates the URL as filters change) and the button element
 * itself (so callers can show transient feedback). Idempotent: re-running
 * returns the existing button instead of adding a second one. Returns null when
 * the page isn't filterable or no suitable anchor is found.
 */
export function injectSaveSearchButton(
  doc: Document,
  location: Location,
  onSave: (url: string, button: HTMLButtonElement) => void,
): HTMLButtonElement | null {
  if (!isFilterableListPage(doc, location)) return null;

  const existing = doc.querySelector<HTMLButtonElement>("button.ao3-tracker-save-search");
  if (existing) return existing;

  const anchor =
    doc.querySelector("#main ul.navigation.actions") ??
    doc.querySelector("#main h2.heading") ??
    doc.querySelector("form#work-filters");
  if (!anchor) return null;

  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "ao3-tracker-save-search";
  btn.textContent = SAVE_SEARCH_LABEL;
  btn.style.cssText = [
    "display:inline-block",
    "margin:0 0 0 .5em",
    "padding:2px 10px",
    "background:#990000",
    "color:#fff",
    "border:0",
    "border-radius:4px",
    "font-size:13px",
    "font-weight:600",
    "cursor:pointer",
  ].join("; ");
  btn.addEventListener("click", () => onSave(location.href, btn));
  anchor.appendChild(btn);
  return btn;
}

export function findListWorkIds(doc: Document): number[] {
  const blurbs = doc.querySelectorAll<HTMLLIElement>('li[id^="work_"]');
  const ids: number[] = [];
  for (const blurb of blurbs) {
    const match = blurb.id.match(/^work_(\d+)$/);
    if (match?.[1]) {
      const id = Number.parseInt(match[1], 10);
      if (!Number.isNaN(id)) ids.push(id);
    }
  }
  return ids;
}

export function findNextChapterButton(doc: Document): HTMLAnchorElement | null {
  return (
    Array.from(doc.querySelectorAll<HTMLAnchorElement>("#feedback > .actions a[href]")).find(
      (link) => /^Next Chapter\b/.test(normalizeWhitespace(link.textContent) ?? ""),
    ) ?? null
  );
}

/**
 * Compute reading progress, completing a chapter when its bottom Next Chapter
 * button is visible. Otherwise measure within `#chapters` at the
 * bottom of the viewport (so 100% means the reader has scrolled the bottom of
 * the chapters block into view). Returns null if the element isn't on the page
 * or has zero height (e.g. still loading).
 */
export function computeChapterScrollPercentage(doc: Document, win: Window): number | null {
  const element = doc.getElementById("chapters");
  if (!element) return null;

  const next = findNextChapterButton(doc);
  if (next && !["hidden", "collapse"].includes(win.getComputedStyle(next).visibility)) {
    const bounds = next.getBoundingClientRect();
    if (
      bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.top < win.innerHeight &&
      bounds.bottom > 0 &&
      bounds.left < win.innerWidth &&
      bounds.right > 0
    )
      return 100;
  }

  const rect = element.getBoundingClientRect();
  const viewportTop = win.scrollY ?? 0;
  const viewportBottom = viewportTop + (win.innerHeight ?? 0);
  const elementAbsoluteTop = viewportTop + rect.top;
  const elementHeight = rect.height;
  if (elementHeight === 0) return null;

  const scrollDistanceIntoElement = viewportBottom - elementAbsoluteTop;
  let progress = 0;
  if (scrollDistanceIntoElement <= 0) progress = 0;
  else if (scrollDistanceIntoElement >= elementHeight) progress = 100;
  else progress = (scrollDistanceIntoElement / elementHeight) * 100;

  return Math.max(0, Math.min(100, progress));
}
