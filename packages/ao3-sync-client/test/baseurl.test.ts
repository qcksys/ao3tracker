import { describe, expect, it, vi } from "vitest";
import { getSync, postSync } from "~/sync";

function emptyResponse(): Response {
  const body = JSON.stringify({
    works: [],
    chapters: [],
    workMetadata: [],
    chapterMetadata: [],
    tagMetadata: [],
    nextWorkCursor: null,
    hasMore: false,
    serverLastUpdated: "2025-01-01T00:00:00.000Z",
    latestWorkLastReadAt: null,
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sync client baseUrl wiring", () => {
  it("getSync routes to cfg.baseUrl + /api/track/sync", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => emptyResponse());
    await getSync({ baseUrl: "https://example.test", fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/track/sync",
    );
  });

  it("getSync follows the configured baseUrl when it changes between calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => emptyResponse());
    await getSync({ baseUrl: "https://prod.example", fetchImpl });
    await getSync({ baseUrl: "https://local.example", fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://prod.example/api/track/sync",
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://local.example/api/track/sync",
    );
  });

  it("trims a trailing slash on baseUrl", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => emptyResponse());
    await getSync({ baseUrl: "https://example.test/", fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/track/sync",
    );
  });

  it("postSync uses the same baseUrl rules", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            works: [],
            chapters: [],
            favouriteTags: [],
            syncedAt: "2025-01-01T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await postSync(
      { baseUrl: "https://example.test", fetchImpl },
      { works: [], chapters: [] },
    );
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://example.test/api/track/sync",
    );
  });
});
