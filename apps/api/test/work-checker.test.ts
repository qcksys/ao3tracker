import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TDatabase } from "~/db/db.client";
import { getAppSetting } from "~/db/queries/app-setting";
import { findMissingTrackedWorks, getWorkCheckState } from "~/db/queries/work";
import { upsertWorkCheckerStatus } from "~/db/queries/work-checker-status";
import {
  applyWorkCheckerResult,
  claimWorkCheckerJobs,
  DISABLED_WORK_CHECKER_SETTINGS,
  workCheckerSettings,
} from "~/lib/work-checker";
import { checkerRouter } from "~/routes/checker";
import { fetchMissingWorks, handleFetchResult } from "~/scheduled/fetch-missing-works";
import { scheduled } from "~/scheduled/handler";
import {
  claimWorksForRefresh,
  handleRefreshResult,
  isBackupCurrent,
  refreshStaleWorks,
  storeWorkBackup,
} from "~/scheduled/refresh-works";
import { chapterIndexHtml, workPageHtml } from "~test/ao3-parser.fixtures";

vi.mock("~/db/db.client", () => ({ createDbConnection: vi.fn(() => ({})) }));
vi.mock("~/db/queries/app-setting", () => ({ getAppSetting: vi.fn() }));
vi.mock("~/db/queries/work-checker-status", () => ({ upsertWorkCheckerStatus: vi.fn() }));
vi.mock("~/db/queries/work", () => ({
  findMissingTrackedWorks: vi.fn(),
  getWorkCheckState: vi.fn(),
}));
vi.mock("~/lib/notification-service", () => ({ dispatchPendingNotifications: vi.fn() }));
vi.mock("~/scheduled/fetch-missing-works", () => ({
  fetchMissingWorks: vi.fn(),
  handleFetchResult: vi.fn(),
}));
vi.mock("~/scheduled/refresh-works", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/scheduled/refresh-works")>()),
  claimWorksForRefresh: vi.fn(),
  handleRefreshResult: vi.fn(),
  isBackupCurrent: vi.fn(),
  refreshStaleWorks: vi.fn(),
  storeWorkBackup: vi.fn(),
}));

const db = {} as TDatabase;
const settings = {
  enabled: true,
  pollIntervalSeconds: 300,
  maxWorksPerPoll: 3,
  delayBetweenRequestsMs: 2000,
};
const env = { WORK_CHECKER_TOKEN: "checker-token" } as unknown as CloudflareBindings;
/** The fixture work page: 87 chapters, with download links updated at this time */
const workId = 10828137;
const downloadUpdatedAt = new Date(1731356383 * 1000);
const storedWork = {
  currentChapters: 87,
  refreshFailures: 2,
  downloadUpdatedAt,
  rowDeletedAt: null,
};

function request(path: string, init: RequestInit = {}, token = "checker-token") {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return checkerRouter.request(path, { ...init, headers }, env);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getAppSetting).mockResolvedValue(settings);
});

function disableChecker() {
  vi.mocked(getAppSetting).mockResolvedValue({ ...settings, enabled: false });
}
afterEach(() => vi.restoreAllMocks());

describe("work checker authentication", () => {
  it("rejects a missing or wrong bearer token", async () => {
    expect((await checkerRouter.request("/settings", {}, env)).status).toBe(401);
    expect((await request("/settings", {}, "wrong-token")).status).toBe(401);
  });

  it("rejects every token when the secret is not configured", async () => {
    const response = await checkerRouter.request(
      "/settings",
      { headers: { Authorization: "Bearer undefined" } },
      { ...env, WORK_CHECKER_TOKEN: "" },
    );
    expect(response.status).toBe(401);
  });

  it("serves the configured settings", async () => {
    const response = await request("/settings");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(settings);
  });
});

describe("work checker settings", () => {
  it("reads the work_checker setting", async () => {
    expect(await workCheckerSettings(db)).toEqual(settings);
    expect(getAppSetting).toHaveBeenCalledWith(db, "work_checker");
  });

  it("treats a missing setting as disabled, leaving AO3 fetching to the Worker", async () => {
    vi.mocked(getAppSetting).mockResolvedValue(null);

    expect(await workCheckerSettings(db)).toEqual(DISABLED_WORK_CHECKER_SETTINGS);
  });

  it("treats a value outside the schema as disabled and reports it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getAppSetting).mockResolvedValue({ enabled: "yes" });

    expect(await workCheckerSettings(db)).toEqual(DISABLED_WORK_CHECKER_SETTINGS);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("work checker status", () => {
  const status = {
    checkerId: "hub-dev",
    version: "3a8453f",
    startedAt: "2026-10-28T07:00:00.000Z",
    lastPoll: {
      at: "2026-10-28T07:58:00.000Z",
      durationMs: 30_000,
      enabled: true,
      claimed: 2,
      outcomes: { page: 1, not_found: 0, restricted: 0, unavailable: 1, failed: 0 },
      backupsUploaded: 0,
      backupsFailed: 0,
      stoppedEarly: true,
    },
    lastError: null,
  };

  it("stores a report with the time the Worker received it", async () => {
    const response = await request("/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(status),
    });

    expect(response.status).toBe(204);
    const [, record] = vi.mocked(upsertWorkCheckerStatus).mock.calls[0];
    expect(record).toMatchObject({ checkerId: "hub-dev", status });
    expect(record.reportedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["an invalid checker id", { ...status, checkerId: "Hub Dev!" }],
    ["a missing poll summary field", { ...status, lastPoll: { at: status.lastPoll.at } }],
  ])("rejects %s", async (_name, body) => {
    const response = await request("/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(upsertWorkCheckerStatus).not.toHaveBeenCalled();
  });

  it("requires the checker token", async () => {
    const response = await request("/status", { method: "POST", body: "{}" }, "wrong-token");

    expect(response.status).toBe(401);
  });
});

describe("work checker claims", () => {
  it("hands out no jobs while the checker is disabled", async () => {
    disableChecker();

    const response = await request("/claim", { method: "POST" });
    expect(await response.json()).toEqual({ jobs: [] });
    expect(findMissingTrackedWorks).not.toHaveBeenCalled();
    expect(claimWorksForRefresh).not.toHaveBeenCalled();
  });

  it("fills the poll with missing tracked works first, then leased stale works", async () => {
    vi.mocked(findMissingTrackedWorks).mockResolvedValue([{ workId: 5 }]);
    vi.mocked(claimWorksForRefresh).mockResolvedValue([
      { id: 7, currentChapters: 3, refreshFailures: 0 },
      { id: 8, currentChapters: 1, refreshFailures: 1 },
    ]);

    const response = await request("/claim", { method: "POST" });

    expect(await response.json()).toEqual({
      jobs: [
        { workId: 5, kind: "missing" },
        { workId: 7, kind: "refresh" },
        { workId: 8, kind: "refresh" },
      ],
    });
    expect(findMissingTrackedWorks).toHaveBeenCalledWith({}, 3);
    expect(claimWorksForRefresh).toHaveBeenCalledWith({}, 2);
  });

  it("does not lease stale works once missing works fill the poll", async () => {
    vi.mocked(findMissingTrackedWorks).mockResolvedValue([{ workId: 5 }, { workId: 6 }]);

    expect(await claimWorkCheckerJobs(db, 2)).toHaveLength(2);
    expect(claimWorksForRefresh).not.toHaveBeenCalled();
  });
});

describe("work checker results", () => {
  it("asks for the chapter index when the page has new chapters", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue({ ...storedWork, currentChapters: 86 });

    const response = await applyWorkCheckerResult(db, env, {
      outcome: "page",
      workId,
      workHtml: workPageHtml,
    });

    expect(response).toEqual({ status: "needs_chapter_index" });
    expect(handleRefreshResult).not.toHaveBeenCalled();
  });

  it("applies a refreshed page with its chapter index and lists stale backups", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue({ ...storedWork, currentChapters: 86 });
    vi.mocked(isBackupCurrent).mockImplementation(async (_db, _id, format) => format === "html");

    const response = await applyWorkCheckerResult(db, env, {
      outcome: "page",
      workId,
      workHtml: workPageHtml,
      chapterIndexHtml,
    });

    expect(handleRefreshResult).toHaveBeenCalledOnce();
    const [, , previousFailures, result] = vi.mocked(handleRefreshResult).mock.calls[0];
    expect(previousFailures).toBe(2);
    expect(result).toMatchObject({ workId, success: true });
    expect(result.data?.fetchedChapterIndex).toBe(true);
    expect(response).toEqual({
      status: "applied",
      backups: [
        {
          format: "epub",
          url: `https://archiveofourown.org/downloads/${workId}/XCOM_The_Advent.epub?updated_at=1731356383`,
          downloadUpdatedAt: 1731356383,
        },
      ],
    });
  });

  it("applies an unchanged page without the chapter index", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);
    vi.mocked(isBackupCurrent).mockResolvedValue(true);

    const response = await applyWorkCheckerResult(db, env, {
      outcome: "page",
      workId,
      workHtml: workPageHtml,
    });

    expect(response).toEqual({ status: "applied", backups: [] });
    expect(vi.mocked(handleRefreshResult).mock.calls[0][3].data?.fetchedChapterIndex).toBe(false);
  });

  it("records a page that is not a work page as a retryable failure", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);

    await applyWorkCheckerResult(db, env, {
      outcome: "page",
      workId,
      workHtml: "<html><body>Maintenance</body></html>",
    });

    const result = vi.mocked(handleRefreshResult).mock.calls[0][3];
    expect(result).toMatchObject({ workId, success: false });
    expect(result.error).toContain("is not a work page");
    expect(result.notFound).toBeUndefined();
  });

  it.each([
    [{ outcome: "not_found" as const, workId }, { notFound: true }],
    [{ outcome: "restricted" as const, workId }, { restrictedWork: true }],
    [{ outcome: "unavailable" as const, workId, error: "429" }, { unavailable: true }],
    [{ outcome: "failed" as const, workId, error: "Crashed" }, { error: "Crashed" }],
  ])("passes %o to the refresh handler", async (result, expected) => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);

    expect(await applyWorkCheckerResult(db, env, result)).toEqual({
      status: "applied",
      backups: [],
    });
    expect(handleRefreshResult).toHaveBeenCalledWith(
      db,
      env,
      2,
      expect.objectContaining({ workId, success: false, ...expected }),
    );
  });

  it("applies a result for a work that is not stored as a missing tracked work", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(null);

    const response = await applyWorkCheckerResult(db, env, {
      outcome: "page",
      workId,
      workHtml: workPageHtml,
      chapterIndexHtml,
    });

    expect(response).toEqual({ status: "applied", backups: [] });
    expect(handleFetchResult).toHaveBeenCalledWith(
      db,
      env,
      expect.objectContaining({ workId, success: true }),
    );
    expect(handleRefreshResult).not.toHaveBeenCalled();
  });

  it("ignores a result for a deleted work", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue({ ...storedWork, rowDeletedAt: new Date() });

    await applyWorkCheckerResult(db, env, { outcome: "not_found", workId });

    expect(handleRefreshResult).not.toHaveBeenCalled();
    expect(handleFetchResult).not.toHaveBeenCalled();
  });

  it("rejects a malformed result", async () => {
    const response = await request("/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: "page", workId }),
    });
    expect(response.status).toBe(400);
    expect(getWorkCheckState).not.toHaveBeenCalled();
  });
});

describe("work checker backups", () => {
  function upload(downloadUpdatedAtUnix: number, body = "epub-bytes") {
    return request(`/backups/${workId}/epub?downloadUpdatedAt=${downloadUpdatedAtUnix}`, {
      method: "PUT",
      body,
    });
  }

  it("stores a backup of the work's current download revision", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);
    vi.mocked(isBackupCurrent).mockResolvedValue(false);

    const response = await upload(1731356383);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "stored" });
    const [, , id, format, revision, content] = vi.mocked(storeWorkBackup).mock.calls[0];
    expect([id, format, revision]).toEqual([workId, "epub", downloadUpdatedAt]);
    expect(new TextDecoder().decode(content)).toBe("epub-bytes");
  });

  it("rejects a backup of a superseded revision", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);

    const response = await upload(1731356382);

    expect(response.status).toBe(409);
    expect(storeWorkBackup).not.toHaveBeenCalled();
  });

  it("skips a format that is already backed up", async () => {
    vi.mocked(getWorkCheckState).mockResolvedValue(storedWork);
    vi.mocked(isBackupCurrent).mockResolvedValue(true);

    expect(await (await upload(1731356383)).json()).toEqual({ outcome: "current" });
    expect(storeWorkBackup).not.toHaveBeenCalled();
  });

  it("rejects an unsupported format or an empty body", async () => {
    const pdf = await request(`/backups/${workId}/pdf?downloadUpdatedAt=1731356383`, {
      method: "PUT",
      body: "pdf",
    });
    expect(pdf.status).toBe(400);
    expect((await upload(1731356383, "")).status).toBe(400);
  });
});

describe("scheduled AO3 fetching", () => {
  const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext;
  const event = { cron: "*/5 * * * *" } as ScheduledEvent;

  it("is left to the checker while it is enabled", async () => {
    await scheduled(event, env, ctx);

    expect(refreshStaleWorks).not.toHaveBeenCalled();
    expect(fetchMissingWorks).not.toHaveBeenCalled();
  });

  it("runs in the Worker while the checker is disabled", async () => {
    disableChecker();

    await scheduled(event, env, ctx);

    expect(refreshStaleWorks).toHaveBeenCalledOnce();
    expect(fetchMissingWorks).toHaveBeenCalledOnce();
  });
});
