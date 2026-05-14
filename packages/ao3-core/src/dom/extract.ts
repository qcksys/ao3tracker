import type {
  ChapterInfo,
  TagInfo,
  WorkChapterIndexMessage,
  WorkInfoMessage,
  WorkTagsMessage,
} from "../schemas/messages";
import { normalizeWhitespace } from "./utils";

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

function extractChapterId(doc: Document, location: Location): string | null {
  const urlMatch = location.pathname.match(/\/chapters\/(\d+)/);
  if (urlMatch) return urlMatch[1];

  const dropdown = doc.querySelector<HTMLSelectElement>("#selected_id");
  if (dropdown?.value) return dropdown.value;

  const chapterLink = doc.querySelector<HTMLAnchorElement>("#chapters div.chapter h3.title a");
  if (chapterLink) {
    const linkMatch = chapterLink.href.match(/\/chapters\/(\d+)/);
    if (linkMatch) return linkMatch[1];
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
    summary: text("div.summary blockquote p"),
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
  const items = Array.from(
    doc.querySelectorAll<HTMLLIElement>("#main ol.chapter.index.group li"),
  );
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
      doc.querySelector<HTMLAnchorElement>("#main .heading a[rel='author']")?.getAttribute("href") ??
      null,
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

export function findListWorkIds(doc: Document): number[] {
  const blurbs = doc.querySelectorAll<HTMLLIElement>('li[id^="work_"]');
  const ids: number[] = [];
  for (const blurb of blurbs) {
    const match = blurb.id.match(/^work_(\d+)$/);
    if (match) {
      const id = Number.parseInt(match[1], 10);
      if (!Number.isNaN(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Compute the scroll percentage within the `#chapters` element. Returns null
 * if the element isn't on the page or has zero height (e.g. still loading).
 */
export function computeChapterScrollPercentage(doc: Document, win: Window): number | null {
  const element = doc.getElementById("chapters");
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const viewportTop = win.scrollY ?? 0;
  const elementAbsoluteTop = viewportTop + rect.top;
  const elementHeight = rect.height;
  if (elementHeight === 0) return null;

  const scrollDistanceIntoElement = viewportTop - elementAbsoluteTop;
  let progress = 0;
  if (scrollDistanceIntoElement <= 0) progress = 0;
  else if (scrollDistanceIntoElement >= elementHeight) progress = 100;
  else progress = (scrollDistanceIntoElement / elementHeight) * 100;

  return Math.max(0, Math.min(100, progress));
}
