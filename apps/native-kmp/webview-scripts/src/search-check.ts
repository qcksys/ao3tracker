import {
  readSearchPage,
  recentSearchUrl,
  savedSearchKey,
  withCrossoverLimit,
  withDefaultHiddenTags,
  withSearchLanguage,
} from "@qcksys/ao3tracker-core/dom";
import type { SearchCheckMessage, SearchWork } from "@qcksys/ao3tracker-core/schemas";

export interface SearchCheckOptions {
  previousContext?: string | null;
  since?: number | null;
  fullScan?: boolean;
  resumeUrl?: string | null;
}

export const RECENT_SEARCH_PAGE_LIMIT = 10;

export async function checkSearch(
  initialDocument: Document,
  initialUrl: string,
  hiddenTags: string[],
  hiddenWorkIds: number[],
  language: string | null,
  post: (message: SearchCheckMessage) => void,
  load: (url: string) => Promise<Document> = loadPage,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1500)),
  maxFandoms: number | null = null,
  options: SearchCheckOptions = {},
): Promise<void> {
  try {
    const firstUrl = new URL(
      withCrossoverLimit(
        withSearchLanguage(withDefaultHiddenTags(initialUrl, hiddenTags), language),
        maxFandoms,
      ),
    );
    firstUrl.hash = "";
    for (const key of ["page", "work_search[page]", "bookmark_search[page]"])
      firstUrl.searchParams.delete(key);
    if (!savedSearchKey(firstUrl.href))
      throw new Error("This is not an AO3 work or bookmark search.");
    const viewer = readPage(initialDocument, initialUrl).viewer;
    const hidden = new Set(hiddenWorkIds);
    const context = JSON.stringify([
      savedSearchKey(firstUrl.href),
      viewer,
      [...hidden].sort((a, b) => a - b),
      maxFandoms,
    ]);
    const baseline = options.previousContext !== context || options.since == null;
    const fullScan = options.fullScan === true;
    const pageLimit = fullScan ? Infinity : baseline ? 1 : RECENT_SEARCH_PAGE_LIMIT;
    const results = new Map<number, SearchWork>();
    const visited = new Set<string>();
    let url: string | null = fullScan
      ? firstUrl.href
      : recentSearchUrl(firstUrl.href, baseline ? null : (options.since ?? null));
    if (!fullScan && !baseline && options.resumeUrl) {
      const resume = new URL(options.resumeUrl);
      if (resume.origin !== firstUrl.origin || savedSearchKey(resume.href) !== savedSearchKey(url))
        throw new Error(
          "Saved pagination no longer matches this search. Run a full scan to reset it.",
        );
      url = resume.href;
    }
    while (url) {
      if (visited.has(url)) throw new Error("AO3 repeated a results page. Please try again.");
      visited.add(url);
      const doc =
        visited.size === 1 && url === new URL(initialUrl).href ? initialDocument : await load(url);
      const page = readPage(doc, url, maxFandoms);
      if (viewer !== page.viewer)
        throw new Error("AO3 sign-in changed during the check. Please try again.");
      for (const work of page.works) results.set(work.id, work);
      post({ type: "searchCheckProgress", pages: visited.size });
      url = page.next;
      if (visited.size >= pageLimit) break;
      if (url) await pause();
    }
    post({
      type: "searchCheckResult",
      context,
      works: [...results.values()].filter((work) => !hidden.has(work.id)),
      baseline,
      complete: (!fullScan && baseline) || url === null,
      nextUrl: !fullScan && !baseline ? url : null,
      fullScan,
    });
  } catch (error) {
    post({
      type: "searchCheckError",
      error: error instanceof Error ? error.message : "Could not check this search.",
      ...(error instanceof SearchRateLimitError
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  }
}

class SearchRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("AO3 is limiting requests. Search checks are paused; try again later.");
  }
}

function readPage(doc: Document, url: string, maxFandoms: number | null = null) {
  try {
    return readSearchPage(doc, url, maxFandoms);
  } catch (error) {
    // The initial WebView document has no fetch response headers available to JavaScript.
    if (/\b(?:429|too many requests|retry later)\b/i.test(doc.body.textContent ?? ""))
      throw new SearchRateLimitError(300);
    throw error;
  }
}

async function loadPage(url: string): Promise<Document> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds =
        retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter)
          : retryAfter
            ? (Date.parse(retryAfter) - Date.now()) / 1000
            : NaN;
      throw new SearchRateLimitError(
        Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 300,
      );
    }
    if (!response.ok) throw new Error(`AO3 returned ${response.status}. Please try again later.`);
    return new DOMParser().parseFromString(await response.text(), "text/html");
  } finally {
    clearTimeout(timeout);
  }
}
