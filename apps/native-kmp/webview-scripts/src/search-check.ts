import {
  readSearchPage,
  savedSearchKey,
  withDefaultHiddenTags,
  withSearchLanguage,
} from "@qcksys/ao3tracker-core/dom";
import type { SearchCheckMessage, SearchWork } from "@qcksys/ao3tracker-core/schemas";

export async function checkSearch(
  initialDocument: Document,
  initialUrl: string,
  hiddenTags: string[],
  hiddenWorkIds: number[],
  language: string | null,
  post: (message: SearchCheckMessage) => void,
  load: (url: string) => Promise<Document> = loadPage,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1500)),
): Promise<void> {
  try {
    const firstUrl = new URL(
      withSearchLanguage(withDefaultHiddenTags(initialUrl, hiddenTags), language),
    );
    firstUrl.hash = "";
    for (const key of ["page", "work_search[page]", "bookmark_search[page]"])
      firstUrl.searchParams.delete(key);
    if (!savedSearchKey(firstUrl.href))
      throw new Error("This is not an AO3 work or bookmark search.");
    const results = new Map<number, SearchWork>();
    const visited = new Set<string>();
    let url: string | null = firstUrl.href;
    let viewer: string | undefined;
    while (url) {
      if (visited.has(url)) throw new Error("AO3 repeated a results page. Please try again.");
      visited.add(url);
      const doc =
        visited.size === 1 && url === new URL(initialUrl).href ? initialDocument : await load(url);
      const page = readSearchPage(doc, url);
      if (viewer !== undefined && viewer !== page.viewer)
        throw new Error("AO3 sign-in changed during the check. Please try again.");
      viewer = page.viewer;
      for (const work of page.works) results.set(work.id, work);
      post({ type: "searchCheckProgress", pages: visited.size });
      url = page.next;
      if (url) await pause();
    }
    const hidden = new Set(hiddenWorkIds);
    post({
      type: "searchCheckResult",
      context: JSON.stringify([
        savedSearchKey(firstUrl.href),
        viewer,
        [...hidden].sort((a, b) => a - b),
      ]),
      works: [...results.values()].filter((work) => !hidden.has(work.id)),
    });
  } catch (error) {
    post({
      type: "searchCheckError",
      error: error instanceof Error ? error.message : "Could not check this search.",
    });
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
    if (!response.ok) throw new Error(`AO3 returned ${response.status}. Please try again later.`);
    return new DOMParser().parseFromString(await response.text(), "text/html");
  } finally {
    clearTimeout(timeout);
  }
}
