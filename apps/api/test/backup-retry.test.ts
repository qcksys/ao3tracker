import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import { findLatestBackupUpdatedAt, upsertBackup } from "~/db/queries/backup";
import { parseWorkPage } from "~/lib/ao3-parser";
import { downloadAndBackupWork } from "~/scheduled/refresh-works";
import { workPageHtml } from "~test/ao3-parser.fixtures";

vi.mock("~/db/queries/backup", () => ({
  findLatestBackupUpdatedAt: vi.fn(),
  upsertBackup: vi.fn(),
}));
vi.mock("~/lib/ao3-fetch", () => ({ sleep: vi.fn() }));

describe("backup retries by format", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("retries a failed EPUB backup after HTML succeeded without downloading HTML again", async () => {
    const latest = new Map<string, Date>();
    vi.mocked(findLatestBackupUpdatedAt).mockImplementation(
      async (_db, _id, format) => latest.get(format) ?? null,
    );
    vi.mocked(upsertBackup).mockImplementation(async (_db, record) => {
      if (record.ao3UpdatedAt) latest.set(record.format, record.ao3UpdatedAt);
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("epub"))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("html"));
    vi.stubGlobal("fetch", fetchMock);
    const put = vi.fn().mockResolvedValue({});
    const env = {
      WORK_BACKUPS_BUCKET: { put },
    } as unknown as CloudflareBindings;
    const { workInfo } = await parseWorkPage(workPageHtml);
    workInfo.downloadPath = "Work";
    workInfo.downloadUpdatedAt = new Date("2026-09-01T00:00:00Z");
    await downloadAndBackupWork({} as TDatabase, env, 123, workInfo);
    await downloadAndBackupWork({} as TDatabase, env, 123, workInfo);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/downloads/123/Work.html",
      "/downloads/123/Work.epub",
      "/downloads/123/Work.epub",
    ]);
    expect(put).toHaveBeenCalledTimes(2);
    expect([...latest.keys()].sort()).toEqual(["epub", "html"]);
  });
});
