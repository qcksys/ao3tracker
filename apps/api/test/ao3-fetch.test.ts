import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChapterHtml,
  fetchChapterIndexHtml,
  fetchWorkHtml,
  NotFoundError,
} from "~/lib/ao3-fetch";

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
