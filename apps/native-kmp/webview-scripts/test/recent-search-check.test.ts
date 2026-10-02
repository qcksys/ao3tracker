import { recentSearchUrl, savedSearchKey } from "@qcksys/ao3tracker-core/dom";
import { type SearchCheckMessage, searchCheckMessageSchema } from "@qcksys/ao3tracker-core/schemas";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { checkSearch, RECENT_SEARCH_PAGE_LIMIT } from "../src/search-check";

const url = "https://archiveofourown.org/tags/Test/works";
const since = Date.parse("2026-10-02T10:00:00Z");
const context = JSON.stringify([savedSearchKey(url), "/users/reader", [], null]);
const pause = async () => {};
function page(href: string, lastPage = 500, viewer = "reader") {
  const location = new URL(href);
  const number = Number(location.searchParams.get("page") ?? 1);
  location.searchParams.set("page", String(number + 1));
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = `<div id="greeting"><a href="/users/${viewer}">Me</a></div><div id="main"><ol class="work index"><li id="work_${number}"></li></ol>${number < lastPage ? `<a rel="next" href="${location.href.replaceAll("&", "&amp;")}">Next</a>` : ""}</div>`;
  return doc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("recent saved-search checks", () => {
  it("initializes a 500-page search with one sorted results page", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href));
    await checkSearch(
      page(url),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      load,
      pause,
    );
    expect(load).toHaveBeenCalledExactlyOnceWith(recentSearchUrl(url, null));
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckResult",
      baseline: true,
      complete: true,
      fullScan: false,
      works: [{ id: 1 }],
    });
    expect(searchCheckMessageSchema.safeParse(messages.at(-1)).success).toBe(true);
  });

  it("uses a stable context and fetches only the date-filtered results on later checks", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href, 1));
    for (const cursor of [since, since + 86_400_000]) {
      await checkSearch(
        page(url),
        url,
        [],
        [],
        null,
        (message) => messages.push(message),
        load,
        pause,
        null,
        { previousContext: context, since: cursor },
      );
      expect(messages.at(-1)).toMatchObject({
        type: "searchCheckResult",
        context,
        baseline: false,
        complete: true,
      });
      expect(load).toHaveBeenLastCalledWith(recentSearchUrl(url, cursor));
    }
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caps a 500-page incremental check without claiming a complete snapshot", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href));
    const wait = vi.fn(pause);
    await checkSearch(
      page(url),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      load,
      wait,
      null,
      { previousContext: context, since },
    );
    expect(load).toHaveBeenCalledTimes(RECENT_SEARCH_PAGE_LIMIT);
    expect(wait).toHaveBeenCalledTimes(RECENT_SEARCH_PAGE_LIMIT - 1);
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckResult",
      baseline: false,
      complete: false,
      fullScan: false,
    });
  });

  it("resets to a small baseline when the AO3 viewer changes", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href, 500, "other"));
    await checkSearch(
      page(url, 500, "other"),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      load,
      pause,
      null,
      { previousContext: context, since },
    );
    expect(load).toHaveBeenCalledExactlyOnceWith(recentSearchUrl(url, null));
    expect(messages.at(-1)).toMatchObject({ type: "searchCheckResult", baseline: true });
  });

  it("keeps full scans explicit and includes pages beyond the normal cap", async () => {
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href, 12));
    await checkSearch(
      page(url, 12),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      load,
      pause,
      null,
      { previousContext: context, since, fullScan: true },
    );
    expect(load).toHaveBeenCalledTimes(11);
    expect(
      load.mock.calls.every(([href]) => !new URL(href).searchParams.has("work_search[query]")),
    ).toBe(true);
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckResult",
      complete: true,
      fullScan: true,
    });
  });

  it.each([
    ["120", 120],
    ["Fri, 02 Oct 2026 10:01:00 GMT", 60],
    [null, 300],
    ["invalid", 300],
  ])("reports Retry-After %s without retrying AO3", async (header, expected) => {
    vi.spyOn(Date, "now").mockReturnValue(since);
    const fetch = vi.fn(
      async () =>
        new Response("Too many requests", {
          status: 429,
          headers: header ? { "Retry-After": header } : {},
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const messages: SearchCheckMessage[] = [];
    await checkSearch(
      page(url),
      url,
      [],
      [],
      null,
      (message) => messages.push(message),
      undefined,
      pause,
      null,
      { previousContext: context, since },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)).toMatchObject({
      type: "searchCheckError",
      retryAfterSeconds: expected,
    });
    expect(messages.some((message) => message.type === "searchCheckResult")).toBe(false);
    expect(searchCheckMessageSchema.safeParse(messages.at(-1)).success).toBe(true);
  });

  it("resumes capped checks without rereading earlier results pages", async () => {
    const requested: number[] = [];
    const load = vi.fn(async (href: string) => {
      requested.push(Number(new URL(href).searchParams.get("page") ?? 1));
      return page(href, 23);
    });
    let resumeUrl: string | null = null;
    for (let batch = 0; batch < 3; batch++) {
      const messages: SearchCheckMessage[] = [];
      await checkSearch(
        page(url),
        url,
        [],
        [],
        null,
        (message) => messages.push(message),
        load,
        pause,
        null,
        { previousContext: context, since, resumeUrl },
      );
      const result = messages.at(-1);
      if (result?.type !== "searchCheckResult") throw new Error("Expected a result");
      expect(result.complete).toBe(batch === 2);
      resumeUrl = result.nextUrl;
    }
    expect(requested).toEqual(Array.from({ length: 23 }, (_, index) => index + 1));
    expect(resumeUrl).toBeNull();
  });

  it.each(["https://example.com/works?page=11", `${url}?work_search[query]=another&page=11`])(
    "rejects an unrelated saved continuation %s",
    async (resumeUrl) => {
      const messages: SearchCheckMessage[] = [];
      const load = vi.fn(async (href: string) => page(href));
      await checkSearch(
        page(url),
        url,
        [],
        [],
        null,
        (message) => messages.push(message),
        load,
        pause,
        null,
        { previousContext: context, since, resumeUrl },
      );
      expect(load).not.toHaveBeenCalled();
      expect(messages.at(-1)).toMatchObject({ type: "searchCheckError" });
    },
  );

  it("pauses the queue when the initial WebView has an AO3 rate-limit page", async () => {
    const initial = document.implementation.createHTMLDocument();
    initial.body.textContent = "Retry later";
    const messages: SearchCheckMessage[] = [];
    const load = vi.fn(async (href: string) => page(href));
    await checkSearch(initial, url, [], [], null, (message) => messages.push(message), load, pause);
    expect(load).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({ type: "searchCheckError", retryAfterSeconds: 300 });
  });
});
