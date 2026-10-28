import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimStaleWorks,
  getWorkState,
  recordWorkRefreshFailure,
  softDeleteWork,
  updateWork,
} from "~/db/queries/work";
import { refreshRetryDelayMinutes, refreshStaleWorks } from "~/scheduled/refresh-works";
import { fetchWorkDataSafe } from "~/scheduled/work-fetcher";

vi.mock("~/db/db.client", () => ({ createDbConnection: vi.fn(() => ({})) }));
vi.mock("~/db/queries/work", () => ({
  claimStaleWorks: vi.fn(),
  getWorkState: vi.fn(),
  recordWorkRefreshFailure: vi.fn(),
  softDeleteWork: vi.fn(),
  updateWork: vi.fn(),
}));
vi.mock("~/lib/ao3-fetch", () => ({ sleep: vi.fn() }));
vi.mock("~/scheduled/work-fetcher", () => ({
  fetchWorkDataSafe: vi.fn(),
  saveWorkRelations: vi.fn(),
}));

const env = {} as CloudflareBindings;

describe("refresh retry backoff", () => {
  it("doubles from 30 minutes and caps at the normal refresh interval", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(refreshRetryDelayMinutes)).toEqual([
      30, 60, 120, 240, 360, 360, 360,
    ]);
  });
});

describe("stale work refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ now: new Date("2026-10-27T06:00:00Z") });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getWorkState).mockResolvedValue({
      title: "Work",
      currentChapters: 3,
      totalChapters: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("claims one work at a time with a 30 minute lease", async () => {
    vi.mocked(claimStaleWorks).mockResolvedValue([]);

    await refreshStaleWorks(env);

    expect(claimStaleWorks).toHaveBeenCalledWith(
      {},
      new Date("2026-10-27T00:00:00Z"),
      new Date("2026-10-27T00:30:00Z"),
      1,
    );
    expect(fetchWorkDataSafe).not.toHaveBeenCalled();
  });

  it("stops the run when AO3 is unavailable and backs the work off by its failure count", async () => {
    vi.mocked(claimStaleWorks).mockResolvedValue([
      { id: 7, currentChapters: 3, refreshFailures: 1 },
    ]);
    vi.mocked(fetchWorkDataSafe).mockResolvedValue({
      workId: 7,
      success: false,
      unavailable: true,
      error: "Request failed with status code 525",
    });

    await refreshStaleWorks(env);

    expect(fetchWorkDataSafe).toHaveBeenCalledOnce();
    expect(fetchWorkDataSafe).toHaveBeenCalledWith(7, { knownChapterCount: 3 });
    expect(recordWorkRefreshFailure).toHaveBeenCalledWith(
      {},
      7,
      2,
      new Date("2026-10-27T01:00:00Z"),
    );
    expect(updateWork).not.toHaveBeenCalled();
    expect(softDeleteWork).not.toHaveBeenCalled();
  });

  it("continues past a failure that is specific to one work", async () => {
    vi.mocked(claimStaleWorks)
      .mockResolvedValueOnce([{ id: 7, currentChapters: 3, refreshFailures: 0 }])
      .mockResolvedValueOnce([{ id: 8, currentChapters: 1, refreshFailures: 0 }])
      .mockResolvedValue([]);
    vi.mocked(fetchWorkDataSafe).mockImplementation(async (workId) => ({
      workId,
      success: false,
      unavailable: false,
      error: "Could not parse work page",
    }));

    await refreshStaleWorks(env);

    expect(vi.mocked(fetchWorkDataSafe).mock.calls.map(([workId]) => workId)).toEqual([7, 8]);
    expect(recordWorkRefreshFailure).toHaveBeenCalledWith(
      {},
      7,
      1,
      new Date("2026-10-27T00:30:00Z"),
    );
  });

  it("stops claiming works once the run budget is spent", async () => {
    vi.mocked(claimStaleWorks).mockResolvedValue([
      { id: 7, currentChapters: 3, refreshFailures: 0 },
    ]);
    vi.mocked(fetchWorkDataSafe).mockImplementation(async (workId) => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      return { workId, success: false, unavailable: false, error: "Could not parse work page" };
    });

    await refreshStaleWorks(env);

    expect(fetchWorkDataSafe).toHaveBeenCalledOnce();
  });
});
