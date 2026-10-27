import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimStaleWorks, getWorkState, softDeleteWork, updateWork } from "~/db/queries/work";
import { refreshStaleWorks } from "~/scheduled/refresh-works";
import { fetchWorksBatch } from "~/scheduled/work-fetcher";

vi.mock("~/db/db.client", () => ({ createDbConnection: vi.fn(() => ({})) }));
vi.mock("~/db/queries/work", () => ({
  claimStaleWorks: vi.fn(),
  getWorkState: vi.fn(),
  softDeleteWork: vi.fn(),
  updateWork: vi.fn(),
}));
vi.mock("~/scheduled/work-fetcher", () => ({
  fetchWorksBatch: vi.fn(),
  saveWorkRelations: vi.fn(),
}));

describe("stale work refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ now: new Date("2026-10-27T06:00:00Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("leases claimed works for a 30 minute retry instead of the full refresh interval", async () => {
    vi.mocked(claimStaleWorks).mockResolvedValue([]);

    await refreshStaleWorks({} as CloudflareBindings);

    expect(claimStaleWorks).toHaveBeenCalledWith(
      {},
      new Date("2026-10-27T00:00:00Z"),
      new Date("2026-10-27T00:30:00Z"),
      12,
    );
    expect(fetchWorksBatch).not.toHaveBeenCalled();
  });

  it("leaves a failed fetch on its claim so it is retried after the lease", async () => {
    vi.mocked(claimStaleWorks).mockResolvedValue([{ id: 7, currentChapters: 3 }]);
    vi.mocked(getWorkState).mockResolvedValue({
      title: "Work",
      currentChapters: 3,
      totalChapters: null,
    });
    vi.mocked(fetchWorksBatch).mockResolvedValue([
      { workId: 7, success: false, error: "Request timed out" },
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await refreshStaleWorks({} as CloudflareBindings);

    expect(fetchWorksBatch).toHaveBeenCalledWith([7], new Map([[7, 3]]));
    expect(updateWork).not.toHaveBeenCalled();
    expect(softDeleteWork).not.toHaveBeenCalled();
  });
});
