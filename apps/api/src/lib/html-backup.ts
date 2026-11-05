/**
 * Splits an AO3 HTML download into the sections the native offline reader shows.
 *
 * AO3 renders downloads from `downloads/show.html.erb`: `#preface`, then `#chapters` with one
 * `div.meta.group` header per chapter (none for a single-chapter work), then `#afterword`.
 * Chapters carry no AO3 chapter IDs, so callers label them by position.
 */
import { AO3_BASE_URL } from "~/const";

export interface HtmlBackupChapter {
  html: string;
  /** Image URLs removed from this chapter, including the preface's on the first and the afterword's on the last */
  images: string[];
}

export interface HtmlBackupContent {
  /** CSS from the download's own `<style>` element */
  styles: string;
  /** Work tags, title, byline, summary and notes */
  preface: string;
  /** Work end notes */
  afterword: string;
  chapters: HtmlBackupChapter[];
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

/**
 * Returns null when the file is not an AO3 HTML download with at least one chapter.
 */
export async function readHtmlBackup(html: string): Promise<HtmlBackupContent | null> {
  const nonce = crypto.randomUUID();
  const marker = (name: string) => `<!--ao3tracker-${nonce}-${name}-->`;
  const section = (name: string): HTMLRewriterElementContentHandlers => ({
    element(element) {
      element.prepend(marker(`${name}-start`), { html: true });
      element.append(marker(`${name}-end`), { html: true });
    },
  });

  let styles = "";
  // Index of the chapter being read; -1 until the first chapter header.
  let chapter = -1;
  const images: string[][] = [];

  let rewriter = new HTMLRewriter()
    // Removing the source's comments keeps the inserted markers unique.
    .onDocument({ comments: (comment) => void comment.remove() })
    .on("head style", {
      text(chunk) {
        styles += chunk.text;
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
    .on("div#preface", section("preface"))
    .on("div#chapters", section("chapters"))
    .on("div#chapters > div.meta.group", {
      element(element) {
        chapter++;
        element.before(marker("chapter"), { html: true });
      },
    })
    .on("div#afterword", section("afterword"));

  const output = await rewriter.transform(new Response(html)).text();

  const between = (name: string): string | null => {
    const start = output.indexOf(marker(`${name}-start`));
    const end = start < 0 ? -1 : output.indexOf(marker(`${name}-end`), start);
    return end < 0 ? null : output.slice(start + marker(`${name}-start`).length, end).trim();
  };

  const body = between("chapters");
  if (body === null) return null;
  const parts = body.split(marker("chapter")).map((part) => part.trim());
  // Text before the first chapter header is whitespace; a single-chapter work has no header.
  const chapters = parts.length === 1 ? parts : parts.slice(1);
  if (chapters.some((part) => part === "")) return null;

  return {
    styles: styles.trim(),
    preface: between("preface") ?? "",
    afterword: between("afterword") ?? "",
    chapters: chapters.map((part, index) => ({ html: part, images: images[index] ?? [] })),
  };
}
