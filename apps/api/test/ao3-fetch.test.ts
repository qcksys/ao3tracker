import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChapterHtml,
  fetchChapterIndexHtml,
  fetchWorkHtml,
  isAo3Unavailable,
  NotFoundError,
} from "~/lib/ao3-fetch";

describe("AO3 availability classification", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function failure(response: Response | Error): Promise<unknown> {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        if (response instanceof Error) throw response;
        return response.clone();
      }),
    );
    return fetchChapterHtml(123, 456).catch((error: unknown) => error);
  }

  it.each([429, 503, 525])("treats HTTP %i as AO3 being unavailable", async (status) => {
    vi.useFakeTimers();
    const result = failure(new Response("", { status }));
    await vi.runAllTimersAsync();
    expect(isAo3Unavailable(await result)).toBe(true);
    vi.useRealTimers();
  });

  it("treats network failures as AO3 being unavailable", async () => {
    vi.useFakeTimers();
    const result = failure(new TypeError("fetch failed"));
    await vi.runAllTimersAsync();
    expect(isAo3Unavailable(await result)).toBe(true);
    vi.useRealTimers();
  });

  it("does not treat a missing work or an unrelated error as AO3 being unavailable", async () => {
    expect(isAo3Unavailable(await failure(new Response("", { status: 404 })))).toBe(false);
    expect(isAo3Unavailable(new Error("Could not parse work page"))).toBe(false);
  });
});

describe("AO3 work page request", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the first-chapter view, which includes the chapter dropdown", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html>Work content</html>"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWorkHtml(123);

    const url = new URL((fetchMock.mock.calls[0][0] as Request).url);
    expect(url.pathname).toBe("/works/123");
    expect(url.searchParams.get("view_adult")).toBe("true");
    expect(url.searchParams.has("view_full_work")).toBe(false);
  });
});

describe("AO3 TLS failure retries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["work", () => fetchWorkHtml(123)],
    ["chapter index", () => fetchChapterIndexHtml(123)],
    ["chapter", () => fetchChapterHtml(123, 456)],
  ])("recovers %s HTML after a temporary TLS handshake failure", async (_name, fetchHtml) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("SSL handshake failed", { status: 525 }))
      .mockResolvedValueOnce(new Response("<html>Work content</html>"));
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchHtml().catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    expect(await result).toBe("<html>Work content</html>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after the existing retry budget when TLS failures persist", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response("SSL handshake failed", { status: 525 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchWorkHtml(123).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    expect(await result).toMatchObject({ response: { status: 525 } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["work", () => fetchWorkHtml(123)],
    ["chapter index", () => fetchChapterIndexHtml(123)],
    ["chapter", () => fetchChapterHtml(123, 456)],
  ])("does not retry or misclassify a deleted %s", async (_name, fetchHtml) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHtml()).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
