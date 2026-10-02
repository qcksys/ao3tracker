/**
 * AO3 HTML Parser using HTMLRewriter
 * Parses work metadata, tags, and chapter index from AO3 HTML pages.
 */

import {
  normalizeWorkSummary,
  WORK_SUMMARY_BLOCK_ELEMENTS,
  WORK_SUMMARY_SELECTOR,
} from "@qcksys/ao3tracker-core/work-summary";
import { z } from "zod";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";

// ============================================================================
// Zod Schemas - Single source of truth for parser data structures
// ============================================================================

/** Tag info schema */
export const sTagInfo = z.object({
  tag: z.string().nullable(),
  href: z.string().nullable(),
});

/** Work info schema - extracted from a work page */
export const sWorkInfo = z.object({
  workName: z.string().nullable(),
  workLastUpdated: z.string().nullable(),
  chapterName: z.string().nullable(),
  chapterNumber: z.string().nullable(),
  totalChapters: z.string().nullable(),
  authorUrl: z.string().nullable(),
  authorName: z.string().nullable(),
  summary: z.string().nullable(),
  wordCount: z.string().nullable(),
  language: z.string().nullable(),
  kudos: z.string().nullable(),
  hits: z.string().nullable(),
  bookmarks: z.string().nullable(),
  comments: z.string().nullable(),
  downloadPath: z.string().nullable(),
  downloadUpdatedAt: z.date().nullable(),
});

/** Work tags schema - extracted from a work page */
export const sWorkTags = z.object({
  workLastUpdated: z.string().nullable(),
  rating: sTagInfo.nullable(),
  warning: z.array(sTagInfo),
  category: z.array(sTagInfo),
  fandom: z.array(sTagInfo),
  relationship: z.array(sTagInfo),
  character: z.array(sTagInfo),
  freeform: z.array(sTagInfo),
});

/** Chapter dropdown info schema - from select#selected_id on work page */
export const sChapterDropdownInfo = z.object({
  chapterId: z.number(),
  chapterTitle: z.string(),
});

/** Chapter info schema - from the navigate page (includes date) */
export const sChapterInfo = z.object({
  chapterDate: z.string().nullable(),
  chapterNumber: z.string().nullable(),
  chapterUrl: z.string().nullable(),
});

/** Chapter index schema - from the navigate page */
export const sWorkChapterIndex = z.object({
  authorUrl: z.string().nullable(),
  chapters: z.array(sChapterInfo),
});

/** Combined parsed result schema */
export const sParsedWork = z.object({
  workInfo: sWorkInfo,
  workTags: sWorkTags,
  chapters: z.array(sChapterDropdownInfo),
});

// ============================================================================
// Types - Derived from Zod schemas
// ============================================================================

/** Tag info structure */
export type TagInfo = z.infer<typeof sTagInfo>;

/** Work info extracted from a work page */
export type WorkInfo = z.infer<typeof sWorkInfo>;

/** Work tags extracted from a work page */
export type WorkTags = z.infer<typeof sWorkTags>;

/** Chapter dropdown info from the work page select#selected_id */
export type ChapterDropdownInfo = z.infer<typeof sChapterDropdownInfo>;

/** Chapter info from the navigate page (includes date) */
export type ChapterInfo = z.infer<typeof sChapterInfo>;

/** Chapter index from the navigate page */
export type WorkChapterIndex = z.infer<typeof sWorkChapterIndex>;

/** Combined parsed result */
export type ParsedWork = z.infer<typeof sParsedWork>;

// State object to accumulate parsed data
interface ParserState {
  workInfo: WorkInfo;
  workTags: WorkTags;
  chapters: ChapterDropdownInfo[];
  // Temporary state for tracking context
  currentTagType: string | null;
  inByline: boolean;
  inBylineAnchor: boolean;
  inTitle: boolean;
  inChapterTitle: boolean;
  inStatsSection: boolean;
  currentStatsDd: string | null;
  inTagAnchor: boolean;
  currentTagAnchor: TagInfo;
  inBookmarksAnchor: boolean;
  // Chapter dropdown parsing state
  inChapterSelect: boolean;
  inChapterOption: boolean;
  currentChapterOption: { chapterId: number | null; chapterTitle: string };
}

// State for chapter index parsing
interface ChapterIndexState {
  authorUrl: string | null;
  chapters: ChapterInfo[];
  currentChapter: ChapterInfo;
  inChapterAnchor: boolean;
  inDatetimeSpan: boolean;
  inAuthorAnchor: boolean;
}

function createInitialState(): ParserState {
  return {
    workInfo: {
      workName: null,
      workLastUpdated: null,
      chapterName: null,
      chapterNumber: null,
      totalChapters: null,
      authorUrl: null,
      authorName: null,
      summary: null,
      wordCount: null,
      language: null,
      kudos: null,
      hits: null,
      bookmarks: null,
      comments: null,
      downloadPath: null,
      downloadUpdatedAt: null,
    },
    workTags: {
      workLastUpdated: null,
      rating: null,
      warning: [],
      category: [],
      fandom: [],
      relationship: [],
      character: [],
      freeform: [],
    },
    chapters: [],
    currentTagType: null,
    inByline: false,
    inBylineAnchor: false,
    inTitle: false,
    inChapterTitle: false,
    inStatsSection: false,
    currentStatsDd: null,
    inTagAnchor: false,
    currentTagAnchor: { tag: null, href: null },
    inBookmarksAnchor: false,
    inChapterSelect: false,
    inChapterOption: false,
    currentChapterOption: { chapterId: null, chapterTitle: "" },
  };
}

function createChapterIndexState(): ChapterIndexState {
  return {
    authorUrl: null,
    chapters: [],
    currentChapter: {
      chapterDate: null,
      chapterNumber: null,
      chapterUrl: null,
    },
    inChapterAnchor: false,
    inDatetimeSpan: false,
    inAuthorAnchor: false,
  };
}

// Helper to check if element has specific classes
function hasClasses(element: Element, ...classes: string[]): boolean {
  const classList = element.getAttribute("class")?.split(/\s+/) ?? [];
  return classes.every((c) => classList.includes(c));
}

/**
 * Parse work info and tags from an AO3 work page HTML
 */
export async function parseWorkPage(html: string): Promise<ParsedWork> {
  const startTime = performance.now();
  const state = createInitialState();
  let summaryText = "";

  const rewriter = new HTMLRewriter()
    // Work title: #workskin h2.title.heading
    .on("#workskin h2.title.heading", {
      element(element) {
        if (hasClasses(element, "title", "heading")) {
          state.inTitle = true;
        }
      },
      text(text) {
        if (state.inTitle) {
          const content = text.text.trim();
          if (content) {
            state.workInfo.workName = state.workInfo.workName
              ? state.workInfo.workName + content
              : content;
          }
          if (text.lastInTextNode) {
            state.inTitle = false;
          }
        }
      },
    })
    // Chapter div ID: #chapters div.chapter
    .on("#chapters div.chapter", {
      element(element) {
        if (hasClasses(element, "chapter")) {
          const id = element.getAttribute("id");
          if (id) {
            state.workInfo.chapterNumber = id;
          }
        }
      },
    })
    // Chapter title: #chapters div.chapter div.chapter.preface.group h3.title
    .on("#chapters div.chapter h3.title", {
      element(element) {
        if (hasClasses(element, "title")) {
          state.inChapterTitle = true;
        }
      },
      text(text) {
        if (state.inChapterTitle) {
          const content = text.text.trim();
          if (content) {
            state.workInfo.chapterName = state.workInfo.chapterName
              ? state.workInfo.chapterName + content
              : content;
          }
          if (text.lastInTextNode) {
            state.inChapterTitle = false;
          }
        }
      },
    })
    // Author link: #workskin .byline.heading a
    .on("#workskin .byline a", {
      element(element) {
        state.inBylineAnchor = true;
        state.workInfo.authorUrl = element.getAttribute("href");
      },
      text(text) {
        if (state.inBylineAnchor) {
          const content = text.text.trim();
          if (content) {
            state.workInfo.authorName = state.workInfo.authorName
              ? state.workInfo.authorName + content
              : content;
          }
          if (text.lastInTextNode) {
            state.inBylineAnchor = false;
          }
        }
      },
    })
    .on(WORK_SUMMARY_SELECTOR, {
      text(text) {
        summaryText += text.text;
      },
    })
    .on(
      WORK_SUMMARY_BLOCK_ELEMENTS.split(", ")
        .map((tag) => `${WORK_SUMMARY_SELECTOR} ${tag}`)
        .join(", "),
      {
        element(element) {
          summaryText += " ";
          if (element.tagName !== "br" && element.tagName !== "hr") {
            element.onEndTag(() => {
              summaryText += " ";
            });
          }
        },
      },
    )
    // Language: .work.meta.group dd.language
    .on("dl.work.meta.group dd.language", {
      text(text) {
        const content = text.text.trim();
        if (content) {
          state.workInfo.language = content;
        }
      },
    })
    // Stats section: .work.meta.group .stats dd.*
    .on("dl.work.meta.group dl.stats dd", {
      element(element) {
        const classList = element.getAttribute("class")?.split(/\s+/) ?? [];
        state.inStatsSection = true;

        if (classList.includes("published")) {
          state.currentStatsDd = "published";
        } else if (classList.includes("status")) {
          state.currentStatsDd = "status";
        } else if (classList.includes("words")) {
          state.currentStatsDd = "words";
        } else if (classList.includes("chapters")) {
          state.currentStatsDd = "chapters";
        } else if (classList.includes("kudos")) {
          state.currentStatsDd = "kudos";
        } else if (classList.includes("hits")) {
          state.currentStatsDd = "hits";
        } else if (classList.includes("bookmarks")) {
          state.currentStatsDd = "bookmarks";
        } else if (classList.includes("comments")) {
          state.currentStatsDd = "comments";
        } else {
          state.currentStatsDd = null;
        }
      },
      text(text) {
        if (!state.inStatsSection || !state.currentStatsDd) return;

        const content = text.text.trim().replace(/,/g, "");
        if (!content) return;

        switch (state.currentStatsDd) {
          case "published":
            // Only set if status not already set
            if (!state.workInfo.workLastUpdated) {
              state.workInfo.workLastUpdated = content;
              state.workTags.workLastUpdated = content;
            }
            break;
          case "status":
            // Status takes precedence over published
            state.workInfo.workLastUpdated = content;
            state.workTags.workLastUpdated = content;
            break;
          case "words":
            state.workInfo.wordCount = content;
            break;
          case "chapters":
            state.workInfo.totalChapters = content;
            break;
          case "kudos":
            state.workInfo.kudos = content;
            break;
          case "hits":
            state.workInfo.hits = content;
            break;
          case "comments":
            state.workInfo.comments = content;
            break;
        }

        if (text.lastInTextNode) {
          state.currentStatsDd = null;
          state.inStatsSection = false;
        }
      },
    })
    // Bookmarks anchor (special case - nested in dd.bookmarks)
    .on("dl.work.meta.group dl.stats dd.bookmarks a", {
      element() {
        state.inBookmarksAnchor = true;
      },
      text(text) {
        if (state.inBookmarksAnchor) {
          const content = text.text.trim().replace(/,/g, "");
          if (content) {
            state.workInfo.bookmarks = content;
          }
          if (text.lastInTextNode) {
            state.inBookmarksAnchor = false;
          }
        }
      },
    })
    // Tag sections: .work.meta.group dd.{type}.tags a
    .on("dl.work.meta.group dd.tags", {
      element(element) {
        const classList = element.getAttribute("class")?.split(/\s+/) ?? [];

        if (classList.includes("rating")) {
          state.currentTagType = "rating";
        } else if (classList.includes("warning")) {
          state.currentTagType = "warning";
        } else if (classList.includes("category")) {
          state.currentTagType = "category";
        } else if (classList.includes("fandom")) {
          state.currentTagType = "fandom";
        } else if (classList.includes("relationship")) {
          state.currentTagType = "relationship";
        } else if (classList.includes("character")) {
          state.currentTagType = "character";
        } else if (classList.includes("freeform")) {
          state.currentTagType = "freeform";
        } else {
          state.currentTagType = null;
        }
      },
    })
    // Download links: li.download ul a (parse first download link for path and updated_at)
    .on("li.download ul a", {
      element(element) {
        // Only parse the first download link
        if (state.workInfo.downloadPath === null) {
          const href = element.getAttribute("href");
          if (href) {
            // Parse the URL to extract filename and updated_at
            // Format: /downloads/10828137/XCOM_The_Advent.epub?updated_at=1731356383
            const url = new URL(href, "https://archiveofourown.org");
            // Extract just the filename without extension (path is predictable: /downloads/{workId}/)
            const filename = url.pathname
              .split("/")
              .pop()
              ?.replace(/\.(azw3|epub|mobi|pdf|html)$/, "");
            state.workInfo.downloadPath = filename ?? null;

            const updatedAtParam = url.searchParams.get("updated_at");
            if (updatedAtParam) {
              const updatedAtNum = Number.parseInt(updatedAtParam, 10);
              if (!Number.isNaN(updatedAtNum)) {
                state.workInfo.downloadUpdatedAt = new Date(updatedAtNum * 1000);
              }
            }
          }
        }
      },
    })
    // Chapter dropdown: select#selected_id
    .on("select#selected_id", {
      element() {
        state.inChapterSelect = true;
      },
    })
    // Chapter dropdown options
    .on("select#selected_id option", {
      element(element) {
        if (state.inChapterSelect) {
          state.inChapterOption = true;
          const value = element.getAttribute("value");
          state.currentChapterOption = {
            chapterId: value ? Number.parseInt(value, 10) : null,
            chapterTitle: "",
          };
        }
      },
      text(text) {
        if (state.inChapterOption) {
          // Accumulate text (may come in chunks across multiple lines)
          const content = text.text.trim();
          if (content) {
            state.currentChapterOption.chapterTitle = state.currentChapterOption.chapterTitle
              ? `${state.currentChapterOption.chapterTitle} ${content}`
              : content;
          }

          if (text.lastInTextNode) {
            // Clean up and save the chapter
            const { chapterId, chapterTitle } = state.currentChapterOption;
            if (chapterId !== null && !Number.isNaN(chapterId)) {
              state.chapters.push({
                chapterId,
                // Normalize whitespace (collapse multiple spaces to single)
                chapterTitle: chapterTitle.replace(/\s+/g, " "),
              });
            }
            state.inChapterOption = false;
            state.currentChapterOption = {
              chapterId: null,
              chapterTitle: "",
            };
          }
        }
      },
    })
    // Tag anchors
    .on("dl.work.meta.group dd.tags a.tag", {
      element(element) {
        if (state.currentTagType) {
          state.inTagAnchor = true;
          state.currentTagAnchor = {
            tag: null,
            href: element.getAttribute("href"),
          };
        }
      },
      text(text) {
        if (state.inTagAnchor && state.currentTagType) {
          const content = text.text.trim();
          if (content) {
            state.currentTagAnchor.tag = state.currentTagAnchor.tag
              ? state.currentTagAnchor.tag + content
              : content;
          }

          if (text.lastInTextNode) {
            const tagInfo = { ...state.currentTagAnchor };
            state.inTagAnchor = false;

            switch (state.currentTagType) {
              case "rating":
                state.workTags.rating = tagInfo;
                break;
              case "warning":
                state.workTags.warning.push(tagInfo);
                break;
              case "category":
                state.workTags.category.push(tagInfo);
                break;
              case "fandom":
                state.workTags.fandom.push(tagInfo);
                break;
              case "relationship":
                state.workTags.relationship.push(tagInfo);
                break;
              case "character":
                state.workTags.character.push(tagInfo);
                break;
              case "freeform":
                state.workTags.freeform.push(tagInfo);
                break;
            }

            state.currentTagAnchor = { tag: null, href: null };
          }
        }
      },
    });

  // Create a Response from the HTML string and transform it
  const response = new Response(html);
  await rewriter.transform(response).text();

  state.workInfo.summary = normalizeWorkSummary(summaryText);

  console.log({
    message: "Parsed work page",
    parseTimeMs: Math.round(performance.now() - startTime),
    htmlLength: html.length,
    chapterCount: state.chapters.length,
  });

  return {
    workInfo: state.workInfo,
    workTags: state.workTags,
    chapters: state.chapters,
  };
}

/**
 * Parse chapter index from an AO3 work navigate page HTML
 */
export async function parseChapterIndex(html: string): Promise<WorkChapterIndex> {
  const startTime = performance.now();
  const state = createChapterIndexState();

  const rewriter = new HTMLRewriter()
    // Author link: #main .heading a[rel='author']
    .on("#main .heading a[rel='author']", {
      element(element) {
        state.authorUrl = element.getAttribute("href");
      },
    })
    // Chapter list items: #main ol.chapter.index.group li
    .on("#main ol.chapter li", {
      element() {
        // Reset current chapter for new list item
        state.currentChapter = {
          chapterDate: null,
          chapterNumber: null,
          chapterUrl: null,
        };
      },
    })
    // Chapter anchors within list items
    .on("#main ol.chapter li a", {
      element(element) {
        state.inChapterAnchor = true;
        state.currentChapter.chapterUrl = element.getAttribute("href");
      },
      text(text) {
        if (state.inChapterAnchor) {
          const content = text.text.trim();
          if (content) {
            state.currentChapter.chapterNumber = state.currentChapter.chapterNumber
              ? state.currentChapter.chapterNumber + content
              : content;
          }
          if (text.lastInTextNode) {
            state.inChapterAnchor = false;
          }
        }
      },
    })
    // Datetime span: span.datetime
    .on("#main ol.chapter li span.datetime", {
      element() {
        state.inDatetimeSpan = true;
      },
      text(text) {
        if (state.inDatetimeSpan) {
          const content = text.text.trim();
          if (content) {
            state.currentChapter.chapterDate = state.currentChapter.chapterDate
              ? state.currentChapter.chapterDate + content
              : content;
          }
          if (text.lastInTextNode) {
            state.inDatetimeSpan = false;
            // Chapter is complete, add to list
            if (state.currentChapter.chapterUrl || state.currentChapter.chapterNumber) {
              state.chapters.push({ ...state.currentChapter });
            }
          }
        }
      },
    });

  const response = new Response(html);
  await rewriter.transform(response).text();

  console.log({
    message: "Parsed chapter index",
    parseTimeMs: Math.round(performance.now() - startTime),
    htmlLength: html.length,
    chapterCount: state.chapters.length,
  });

  return {
    authorUrl: state.authorUrl,
    chapters: state.chapters,
  };
}

/**
 * Fetch and parse work info from AO3
 */
export async function fetchAndParseWork(workId: number, chapterId?: number): Promise<ParsedWork> {
  const url = chapterId
    ? `${AO3_BASE_URL}/works/${workId}/chapters/${chapterId}?view_adult=true`
    : `${AO3_BASE_URL}/works/${workId}?view_adult=true`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": AO3_USER_AGENT,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Failed to fetch work from AO3: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseWorkPage(html);
}

/**
 * Fetch and parse chapter index from AO3
 */
export async function fetchAndParseChapterIndex(workId: number): Promise<WorkChapterIndex> {
  const url = `${AO3_BASE_URL}/works/${workId}/navigate?view_adult=true`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": AO3_USER_AGENT,
    },
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Failed to fetch chapter index from AO3: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  return parseChapterIndex(html);
}
