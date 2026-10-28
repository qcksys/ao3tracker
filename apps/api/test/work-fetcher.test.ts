import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChapterIndexHtml, fetchWorkHtml } from "~/lib/ao3-fetch";
import { fetchWorkData, fetchWorkDataSafe } from "~/scheduled/work-fetcher";
import { minimalHtml, workPageOnlyPublishedHtml } from "./ao3-parser.fixtures";

vi.mock("~/lib/ao3-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/ao3-fetch")>()),
  fetchWorkHtml: vi.fn(),
  fetchChapterIndexHtml: vi.fn(),
  sleep: vi.fn(),
}));

const interstitialHtml = `
<!DOCTYPE html>
<html>
<head><title>Archive of Our Own</title></head>
<body>
<div id="main">
  <p class="notice">The archive is currently down for maintenance.</p>
</div>
</body>
</html>
`;

describe("work page validation", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["an interstitial page", interstitialHtml],
    ["a work skin with no title or chapter count", minimalHtml],
    [
      "a page with a title but no chapter count",
      minimalHtml.replace(
        '<div id="workskin"></div>',
        '<div id="workskin"><h2 class="title heading">A Title</h2></div>',
      ),
    ],
  ])("rejects %s served with a success status", async (_name, html) => {
    vi.mocked(fetchWorkHtml).mockResolvedValue(html);

    await expect(fetchWorkData(1)).rejects.toThrow("is not a work page");
    expect(fetchChapterIndexHtml).not.toHaveBeenCalled();
  });

  it("reports the rejection as a retryable failure, not a deleted or restricted work", async () => {
    vi.mocked(fetchWorkHtml).mockResolvedValue(interstitialHtml);

    const result = await fetchWorkDataSafe(1);

    expect(result).toMatchObject({ workId: 1, success: false });
    expect(result.error).toContain("is not a work page");
    expect(result.data).toBeUndefined();
    expect(result.notFound).toBeUndefined();
    expect(result.restrictedWork).toBeUndefined();
  });

  it("accepts a single-chapter work page", async () => {
    vi.mocked(fetchWorkHtml).mockResolvedValue(workPageOnlyPublishedHtml);

    const data = await fetchWorkData(1, { knownChapterCount: 1 });

    expect(data.workInfo.workName).toBe("A Short Story");
    expect(data.parsed.currentChapters).toBe(1);
    expect(data.parsed.totalChapters).toBe(1);
    expect(fetchChapterIndexHtml).not.toHaveBeenCalled();
  });
});
