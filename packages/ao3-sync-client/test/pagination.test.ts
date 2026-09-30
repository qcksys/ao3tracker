import { expect, it, vi } from "vitest";
import { getFullSync } from "../src/sync";

it("retains the first page's cursor so mutations during pagination are fetched next time", async () => {
  const firstCursor = "2026-01-01T00:00:00.000Z";
  const secondCursor = "2026-01-01T00:01:00.000Z";
  const page = (serverLastUpdated: string, hasMore: boolean, nextWorkCursor: number | null) =>
    Response.json({
      works: [],
      chapters: [],
      workMetadata: [],
      chapterMetadata: [],
      tagMetadata: [],
      hasMore,
      nextWorkCursor,
      serverLastUpdated,
      latestWorkLastReadAt: null,
    });
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(page(firstCursor, true, 10))
    .mockResolvedValueOnce(page(secondCursor, false, null));
  const result = await getFullSync(
    { baseUrl: "https://example.test", fetchImpl },
    { lastSyncedAt: "2025-01-01T00:00:00.000Z" },
  );
  expect(result.serverLastUpdated).toBe(firstCursor);
  expect(result.hasMore).toBe(false);
  expect(fetchImpl.mock.calls[1]?.[0]).toEqual(expect.stringContaining("workCursor=10"));
});
