import type { SearchWork } from "../schemas/search-check";
import { savedSearchKey } from "./browsing";

export function readSearchPage(doc: Document, href: string) {
  const key = savedSearchKey(href);
  const results = doc.querySelector("#main ol.work.index, #main ol.bookmark.index");
  const emptySearch =
    doc.querySelector("#main h2.heading")?.textContent?.trim() === "Search Results" &&
    [...doc.querySelectorAll("#main p")].some((element) =>
      element.textContent?.trim().startsWith("No results found."),
    );
  if (
    !key ||
    (!results && !emptySearch) ||
    doc.querySelector("#main .error, #main form#new_user")
  ) {
    throw new Error(
      "Could not read AO3 results. Open the search to check for a login or error page.",
    );
  }

  const works = new Map<number, SearchWork>();
  for (const blurb of results?.querySelectorAll('li[id^="work_"], li[id^="bookmark_"]') ?? []) {
    const id = Number(
      blurb.id.match(/^work_(\d+)$/)?.[1] ??
        blurb
          .querySelector('h4.heading a[href*="/works/"]')
          ?.getAttribute("href")
          ?.match(/\/works\/(\d+)(?:[/?#]|$)/)?.[1],
    );
    // Bookmarks can also point to series, external works, or deleted works.
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const text = (selector: string) => blurb.querySelector(selector)?.textContent?.trim() ?? "";
    works.set(id, {
      id,
      updated: text(".header .datetime"),
      chapters: text("dd.chapters").replace(/\s/g, ""),
      words: text("dd.words").replace(/[,\s]/g, ""),
    });
  }

  const nextLink = doc.querySelector('a[rel~="next"], .pagination .next a, .pagination a.next');
  const nextHref = nextLink?.getAttribute("href");
  const next = nextHref ? new URL(nextHref, href) : null;
  if (next && (next.origin !== new URL(href).origin || savedSearchKey(next.href) !== key)) {
    throw new Error("AO3 returned pagination for a different search.");
  }
  const viewer = doc.querySelector('#greeting a[href^="/users/"]')?.getAttribute("href") ?? "guest";
  return { works: [...works.values()], next: next?.href ?? null, viewer };
}
