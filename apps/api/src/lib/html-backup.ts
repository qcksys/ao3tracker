/**
 * Rebuilds an AO3 HTML download as AO3's live chapter pages for the native offline reader.
 *
 * AO3 renders downloads from `downloads/show.html.erb`: `#preface`, then `#chapters` with one
 * `div.meta.group` header per chapter (none for a single-chapter work), then `#afterword`. Site
 * skins style the live chapter page (`works/show`, `chapters/_chapter`) instead, so the rewriter
 * maps each download element onto its live counterpart. Downloads carry no AO3 chapter IDs, so
 * callers label chapters by position.
 *
 * HTMLRewriter leaves HTML entities encoded in text and attribute values, and stored titles come
 * from the same parser, so titles and labels here are HTML text rather than plain text.
 */
import { AO3_BASE_URL } from "~/const";

export interface HtmlBackupChapter {
  /** Chapter preface, text and end notes in live markup, containing `titleSlot` */
  html: string;
  /** Image URLs removed from the chapter; the first also reports the work preface's, the last the afterword's */
  images: string[];
}

export interface HtmlBackupContent {
  /** `dl.work.meta.group` with the work's tags and stats */
  tags: string;
  /** `h2.title.heading` and `h3.byline.heading` */
  heading: string;
  /** Work summary and notes modules */
  notes: string;
  /** Work end notes and related works */
  afterword: string;
  chapters: HtmlBackupChapter[];
  /** Placeholder for the `h3.title` in each chapter's `html` */
  titleSlot: string;
  /** CSS from the download's own `<style>` element, which app releases before the live markup still use */
  downloadCss: string;
}

/** A labelled backup chapter that a page shows or links to */
export interface BackupPageChapter {
  /** Position in the work, from 1 */
  number: number;
  /** HTML text; empty when the chapter has no title */
  title: string;
  url: string;
  html: string;
}

const REMOVED_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "frame",
  "frameset",
  "base",
  "link",
  "meta",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "noscript",
  "audio",
  "video",
  "source",
  "track",
  "template",
];
const REMOVED_ATTRIBUTES = new Set([
  "srcset",
  "formaction",
  "ping",
  "download",
  "target",
  "contenteditable",
  "autofocus",
  "nonce",
  "integrity",
]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const AO3_HOSTS = new Set(["archiveofourown.org", "www.archiveofourown.org"]);
const MAX_IMAGES_PER_CHAPTER = 1000;

/** Live `dd` classes of tag rows, keyed by the download's row label */
const TAG_ROWS: Record<string, string> = {
  rating: "rating",
  ratings: "rating",
  "archive warning": "warning",
  "archive warnings": "warning",
  category: "category",
  categories: "category",
  fandom: "fandom",
  fandoms: "fandom",
  relationship: "relationship",
  relationships: "relationship",
  character: "character",
  characters: "character",
  "additional tags": "freeform",
};
const OTHER_ROWS: Record<string, string> = {
  language: "language",
  series: "series",
  collection: "collections",
  collections: "collections",
  stats: "stats",
};
/** Live `dl.stats` classes, keyed by the download's stat label */
const STATS: Record<string, string> = {
  Published: "published",
  Updated: "status",
  Completed: "status",
  Words: "words",
  Chapters: "chapters",
};

/** Absolute http(s) or mailto URL for a link or image address, or null for anything else */
function resolveUrl(value: string): string | null {
  const scheme = value.match(SCHEME)?.[1]?.toLowerCase();
  try {
    if (!scheme) return new URL(value, AO3_BASE_URL).href;
    if (scheme === "mailto" || scheme === "https") return value;
    if (scheme !== "http") return null;
    // Older downloads link to AO3 over http; the offline reader follows only https AO3 links.
    return AO3_HOSTS.has(new URL(value).hostname) ? value.replace(/^http:/i, "https:") : value;
  } catch {
    return null;
  }
}

function rowKey(label: string): string {
  return label.replace(/:\s*$/, "").trim().toLowerCase();
}

/** Text of an HTML fragment, keeping its entities encoded */
function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Guards stored HTML text against markup; its entities are already encoded */
function safeHtmlText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns null when the file is not an AO3 HTML download with at least one chapter.
 */
export async function readHtmlBackup(html: string): Promise<HtmlBackupContent | null> {
  const nonce = crypto.randomUUID();
  const marker = (name: string) => `<!--ao3tracker-${nonce}-${name}-->`;
  const around = (name: string) => (element: Element) => {
    element.before(marker(`${name}-start`), { html: true });
    element.after(marker(`${name}-end`), { html: true });
  };
  const inside = (name: string) => (element: Element) => {
    element.prepend(marker(`${name}-start`), { html: true });
    element.append(marker(`${name}-end`), { html: true });
  };
  const rowClass = (row: number) => marker(`row-${row}`).slice(4, -3);

  // Index of the chapter being read; -1 until the first chapter header.
  let chapter = -1;
  let downloadCss = "";
  const images: string[][] = [];
  const rowLabels: string[] = [];
  const rowTypes: string[] = [];
  const moduleLabels: string[] = [];

  // A summary or notes label paragraph starts a module that runs to the next label.
  const moduleLabel: HTMLRewriterElementContentHandlers = {
    element(element) {
      const index = moduleLabels.push("") - 1;
      element.before(marker(`module-${index}`), { html: true });
      element.tagName = "h3";
      element.setAttribute("class", "heading");
    },
    text(chunk) {
      moduleLabels[moduleLabels.length - 1] += chunk.text;
    },
  };
  const notesHeading = (element: Element) => {
    element.tagName = "h3";
    element.setAttribute("class", "heading");
    element.setInnerContent("Notes:");
  };
  let jumpStart = false;
  let jumpLinked = false;
  const endNotesLink: HTMLRewriterElementContentHandlers = {
    element(element) {
      element.tagName = "p";
      element.setAttribute("class", "jump");
      element.prepend("(");
      element.append(".)");
      jumpStart = true;
      jumpLinked = false;
    },
    text(chunk) {
      // Keep the download's indentation out of AO3's "(See the end of the chapter for more notes.)".
      if (jumpLinked && !chunk.text.trim()) return void chunk.remove();
      if (!jumpStart) return;
      const text = chunk.text.trimStart();
      if (text) {
        chunk.replace(text);
        jumpStart = false;
      } else chunk.remove();
    },
  };
  const endNotesLinkAnchor: HTMLRewriterElementContentHandlers = {
    element() {
      jumpLinked = true;
    },
  };

  let rewriter = new HTMLRewriter()
    // Removing the source's comments keeps the inserted markers unique.
    .onDocument({ comments: (comment) => void comment.remove() })
    .on("head style", {
      text(chunk) {
        downloadCss += chunk.text;
      },
    })
    .on("*", {
      element(element) {
        const names = Array.from(element.attributes, ([name]) => name);
        for (const name of names) {
          if (name.toLowerCase().startsWith("on") || REMOVED_ATTRIBUTES.has(name.toLowerCase())) {
            element.removeAttribute(name);
          }
        }
      },
    });
  for (const tag of REMOVED_ELEMENTS) {
    rewriter = rewriter.on(tag, { element: (element) => void element.remove() });
  }
  rewriter = rewriter
    .on("h2.toc-heading", { element: (element) => void element.remove() })
    .on("#preface > p.message", { element: (element) => void element.remove() })
    .on("#afterword > p.message", { element: (element) => void element.remove() })
    .on("a[href]", {
      element(element) {
        const href = element.getAttribute("href")?.trim() ?? "";
        const chapterNotes = href.match(/^#endnotes(\d+)$/);
        if (href === "#endnotes") element.setAttribute("href", "#work_endnotes");
        else if (chapterNotes) element.setAttribute("href", `#chapter_${chapterNotes[1]}_endnotes`);
        if (href.startsWith("#")) return;
        const url = resolveUrl(href);
        if (url === null) element.removeAttribute("href");
        else if (url !== href) element.setAttribute("href", url);
      },
    })
    .on("img", {
      element(element) {
        const url = resolveUrl(element.getAttribute("src")?.trim() ?? "");
        const index = Math.max(chapter, 0);
        images[index] ??= [];
        if (url && !images[index].includes(url) && images[index].length < MAX_IMAGES_PER_CHAPTER) {
          images[index].push(url);
        }
        // The offline reader's content policy blocks remote images.
        element.removeAttribute("src");
        if (!element.getAttribute("alt")) element.setAttribute("alt", "Image unavailable offline");
      },
    })

    // Work preface: tags, title, byline, summary and notes.
    .on("div#preface", { element: inside("preface") })
    .on("div#preface > div.meta", { element: (element) => void element.removeAndKeepContent() })
    .on("div#preface > div.meta > dl.tags", {
      element(element) {
        around("tags")(element);
        element.setAttribute("class", "work meta group");
      },
    })
    .on("div#preface > div.meta > dl.tags > dt", {
      element(element) {
        rowLabels.push("");
        element.setAttribute("class", rowClass(rowLabels.length - 1));
      },
      text(chunk) {
        rowLabels[rowLabels.length - 1] += chunk.text;
      },
    })
    .on("div#preface > div.meta > dl.tags > dd", {
      element(element) {
        const row = rowLabels.length - 1;
        const key = rowKey(rowLabels[row] ?? "");
        const type = TAG_ROWS[key] ? `${TAG_ROWS[key]} tags` : (OTHER_ROWS[key] ?? "");
        rowTypes[row] = type;
        element.setAttribute("class", type);
        if (TAG_ROWS[key]) {
          element.prepend('<ul class="commas">', { html: true });
          element.append("</ul>", { html: true });
        } else if (type === "stats") inside("stats")(element);
        else if (type === "series") {
          element.prepend('<span class="series"><span class="position">', { html: true });
          element.append("</span></span>", { html: true });
        }
      },
      text(chunk) {
        // `ul.commas` adds its own separators.
        if (rowTypes[rowTypes.length - 1]?.endsWith(" tags") && /^[\s,]*$/.test(chunk.text)) {
          chunk.remove();
        }
      },
    })
    .on("div#preface > div.meta > dl.tags > dd > a", {
      element(element) {
        if (!rowTypes[rowTypes.length - 1]?.endsWith(" tags")) return;
        element.setAttribute("class", "tag");
        element.before("<li>", { html: true });
        element.after("</li>", { html: true });
      },
    })
    .on("div#preface > div.meta > h1", {
      element(element) {
        around("title")(element);
        element.tagName = "h2";
        element.setAttribute("class", "title heading");
      },
    })
    .on("div#preface > div.meta > div.byline", {
      element(element) {
        around("byline")(element);
        element.tagName = "h3";
        element.setAttribute("class", "byline heading");
      },
      text(chunk) {
        if (/^\s*by\s*$/.test(chunk.text)) chunk.remove();
      },
    })
    .on("div#preface > div.meta > p", moduleLabel)
    .on("div#preface > div.meta > div.endnote-link", endNotesLink)
    .on("div#preface > div.meta > div.endnote-link > a", endNotesLinkAnchor)

    // Chapters: a preface group per chapter, its text, then its end notes.
    .on("div#chapters", { element: inside("chapters") })
    .on("div#chapters > div.meta.group", {
      element(element) {
        chapter++;
        element.before(marker("chapter"), { html: true });
        inside("chapter-preface")(element);
        element.setAttribute("class", "chapter preface group");
        element.setAttribute("role", "complementary");
      },
    })
    .on("div#chapters > div.meta.group > h2.heading", {
      element: (element) => void element.replace(marker("title"), { html: true }),
    })
    .on("div#chapters > div.meta.group > p.byline", {
      element(element) {
        element.tagName = "h3";
        element.setAttribute("class", "byline heading");
      },
    })
    .on("div#chapters > div.meta.group > p:not(.byline)", moduleLabel)
    .on("div#chapters > div.meta.group > div.endnote-link", endNotesLink)
    .on("div#chapters > div.meta.group > div.endnote-link > a", endNotesLinkAnchor)
    .on("div#chapters > div.userstuff", {
      element(element) {
        element.setAttribute("class", "userstuff module");
        element.setAttribute("role", "article");
        const landmark = chapter < 0 ? "Work Text:" : "Chapter Text";
        element.prepend(`<h3 class="landmark heading" id="work">${landmark}</h3>`, { html: true });
      },
    })
    .on('div#chapters > div[id^="endnotes"]', {
      element(element) {
        const number = element.getAttribute("id")?.replace("endnotes", "") ?? "";
        element.setAttribute("id", `chapter_${number}_endnotes`);
        element.setAttribute("class", "end notes module");
        element.before('<div class="chapter preface group" role="complementary">', { html: true });
        element.after("</div>", { html: true });
      },
    })
    .on('div#chapters > div[id^="endnotes"] > p', { element: notesHeading })

    // Work end notes and related works.
    .on("div#afterword", { element: inside("afterword") })
    .on("div#afterword > div.meta", { element: (element) => void element.removeAndKeepContent() })
    .on("div#afterword div#endnotes", {
      element(element) {
        element.setAttribute("id", "work_endnotes");
        element.setAttribute("class", "end notes module");
      },
    })
    .on("div#afterword div#endnotes > p", { element: notesHeading });

  let output = await rewriter.transform(new Response(html)).text();

  const section = (name: string) =>
    new RegExp(
      `${escapeRegExp(marker(`${name}-start`))}([\\s\\S]*?)${escapeRegExp(marker(`${name}-end`))}`,
    );
  const between = (text: string, name: string) => text.match(section(name))?.[1].trim() ?? null;
  const without = (text: string, name: string) => text.replace(section(name), "");
  const modulePattern = new RegExp(`<!--ao3tracker-${nonce}-module-(\\d+)-->`);
  const modules = (text: string, chapterLevel: boolean) => {
    const parts = text.split(modulePattern);
    let result = parts[0];
    for (let index = 1; index < parts.length; index += 2) {
      const kind = /summary/i.test(moduleLabels[Number(parts[index])] ?? "") ? "summary" : "notes";
      const heading = `<h3 class="heading">${kind === "summary" ? "Summary" : "Notes"}:</h3>`;
      const body = parts[index + 1].replace(
        /^(\s*)<h3 class="heading">[\s\S]*?<\/h3>/,
        (_match, space: string) => space + heading,
      );
      result += `<div ${chapterLevel ? `id="${kind}" ` : ""}class="${kind} module">${body}</div>`;
    }
    return result;
  };

  rowTypes.forEach((type, row) => {
    output = output.replace(`class="${rowClass(row)}"`, `class="${type}"`);
  });
  output = output.replace(section("stats"), (_match, stats: string) => {
    const rows = [...htmlText(stats).matchAll(/(\w+):\s*(\S+)/g)].filter(
      ([, label]) => STATS[label],
    );
    if (rows.length === 0) return stats;
    const items = rows.map(
      ([, label, value]) =>
        `<dt class="${STATS[label]}">${label}:</dt><dd class="${STATS[label]}">${value}</dd>`,
    );
    return `<dl class="stats">${items.join("")}</dl>`;
  });

  const body = between(output, "chapters");
  if (body === null) return null;
  const parts = body.split(marker("chapter")).map((part) => part.trim());
  // Text before the first chapter header is whitespace; a single-chapter work has no header.
  const chapters = parts.length === 1 ? parts : parts.slice(1);
  if (chapters.some((part) => part === "")) return null;

  const preface = between(output, "preface") ?? "";
  return {
    tags: between(preface, "tags") ?? "",
    heading: [between(preface, "title"), between(preface, "byline")].filter(Boolean).join(""),
    notes: modules(without(without(without(preface, "tags"), "title"), "byline"), false).trim(),
    afterword: between(output, "afterword") ?? "",
    chapters: chapters.map((part, index) => ({
      html: part.replace(section("chapter-preface"), (_match, inner: string) =>
        modules(inner, true),
      ),
      images: images[index] ?? [],
    })),
    titleSlot: marker("title"),
    downloadCss: downloadCss.trim(),
  };
}

/**
 * A complete AO3 chapter page for the backup chapter at `position` in `chapters`, which lists
 * every chapter the page links to, in order.
 */
export function backupChapterPage(
  content: HtmlBackupContent,
  workTitle: string,
  chapters: BackupPageChapter[],
  position: number,
): string {
  const chapter = chapters[position];
  const single = content.chapters.length === 1;
  const link = (target: BackupPageChapter | undefined, kind: string, label: string) =>
    target ? `<li class="chapter ${kind}"><a href="${target.url}">${label}</a></li>` : "";
  const navigation =
    link(chapters[position - 1], "previous", "← Previous Chapter") +
    link(chapters[position + 1], "next", "Next Chapter →");
  // Stored titles come from AO3's chapter menu, which numbers them ("1. Title").
  const chapterTitle = chapter.title.replace(new RegExp(`^${chapter.number}\\.\\s*`), "");
  const title = `<h3 class="title"><a href="${chapter.url}">Chapter ${chapter.number}</a>${chapterTitle ? `: ${safeHtmlText(chapterTitle)}` : ""}</h3>`;
  const text = chapter.html.replace(content.titleSlot, () => title);
  const afterword =
    chapter.number === content.chapters.length && content.afterword
      ? `<div class="afterword preface group">${content.afterword}</div>`
      : "";

  return (
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    `<title>${safeHtmlText(workTitle)}${single ? "" : ` - Chapter ${chapter.number}`}</title></head>` +
    '<body><div id="outer" class="wrapper"><div id="inner" class="wrapper">' +
    '<div id="main" class="chapters-show region" role="main"><div class="work">' +
    (navigation
      ? `<h3 class="landmark heading">Actions</h3><ul class="work navigation actions">${navigation}</ul>`
      : "") +
    `<h3 class="landmark heading">Work Header</h3><div class="wrapper">${content.tags}</div>` +
    `<div id="workskin"><div class="preface group">${content.heading}${chapter.number === 1 ? content.notes : ""}</div>` +
    `<div id="chapters" role="article">${single ? text : `<div class="chapter" id="chapter-${chapter.number}">${text}</div>`}</div>` +
    `${afterword}</div></div>` +
    '<div id="feedback" class="feedback"><h3 class="landmark heading">Actions</h3>' +
    `<ul class="actions" role="navigation"><li><a href="#main">↑ Top</a></li>${navigation}</ul></div>` +
    "</div></div></div></body></html>"
  );
}
