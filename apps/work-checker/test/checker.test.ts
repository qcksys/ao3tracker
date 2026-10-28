import type {
  WorkCheckerResult,
  WorkCheckerResultResponse,
  WorkCheckerSettings,
} from "@qcksys/ao3tracker-core/work-checker";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CheckerApi } from "../src/api.ts";
import type { Ao3Browser, PageLoad } from "../src/browser.ts";
import { chapterIndexUrl, checkWork, classifyLoad, runPoll, workUrl } from "../src/checker.ts";

const settings: WorkCheckerSettings = {
  enabled: true,
  pollIntervalSeconds: 300,
  maxWorksPerPoll: 12,
  delayBetweenRequestsMs: 2000,
};
const backup = {
  format: "epub" as const,
  url: "https://archiveofourown.org/downloads/7/Work.epub?updated_at=1731356383",
  downloadUpdatedAt: 1731356383,
};

function page(overrides: Partial<PageLoad> = {}): PageLoad {
  return {
    status: 200,
    finalUrl: "https://archiveofourown.org/works/7?view_adult=true",
    html: "<html>work</html>",
    challenged: false,
    ...overrides,
  };
}

const api = {
  settings: vi.fn<CheckerApi["settings"]>(),
  claim: vi.fn<CheckerApi["claim"]>(),
  postResult: vi.fn<CheckerApi["postResult"]>(),
  uploadBackup: vi.fn<CheckerApi["uploadBackup"]>(),
};
const browser = {
  load: vi.fn<Ao3Browser["load"]>(),
  download: vi.fn<Ao3Browser["download"]>(),
  close: vi.fn<Ao3Browser["close"]>(),
};
const sleep = vi.fn(async (_ms: number) => {});
const deps = { api, browser, sleep };
const applied: WorkCheckerResultResponse = { status: "applied", backups: [] };

function postedResults(): WorkCheckerResult[] {
  return api.postResult.mock.calls.map(([result]) => result);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  api.postResult.mockResolvedValue(applied);
});

describe("page classification", () => {
  it("passes a readable page to the Worker", () => {
    expect(classifyLoad(7, page())).toBeNull();
  });

  it.each([
    [page({ challenged: true, status: 403 }), "unavailable"],
    [page({ finalUrl: "https://archiveofourown.org/users/login?restricted=true" }), "restricted"],
    [page({ status: 404 }), "not_found"],
    [page({ status: 429 }), "unavailable"],
    [page({ status: 525 }), "unavailable"],
    [page({ status: 403 }), "failed"],
  ])("reports %o as %s", (load, outcome) => {
    expect(classifyLoad(7, load)?.outcome).toBe(outcome);
  });
});

describe("checking a work", () => {
  it("posts the work page and stops there when no chapter index is needed", async () => {
    browser.load.mockResolvedValue(page());

    expect(await checkWork({ workId: 7, kind: "refresh" }, settings, deps)).toBe(true);

    expect(browser.load).toHaveBeenCalledExactlyOnceWith(workUrl(7));
    expect(postedResults()).toEqual([
      { outcome: "page", workId: 7, workHtml: "<html>work</html>" },
    ]);
  });

  it("loads the chapter index when the Worker asks for it", async () => {
    browser.load
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page({ html: "<html>index</html>" }));
    api.postResult.mockResolvedValueOnce({ status: "needs_chapter_index" });

    await checkWork({ workId: 7, kind: "missing" }, settings, deps);

    expect(browser.load.mock.calls.map(([url]) => url)).toEqual([workUrl(7), chapterIndexUrl(7)]);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(postedResults()[1]).toEqual({
      outcome: "page",
      workId: 7,
      workHtml: "<html>work</html>",
      chapterIndexHtml: "<html>index</html>",
    });
  });

  it("reports a navigation timeout as AO3 being unavailable", async () => {
    browser.load.mockRejectedValue(new Error("page.goto: Timeout 60000ms exceeded"));

    expect(await checkWork({ workId: 7, kind: "refresh" }, settings, deps)).toBe(false);

    expect(postedResults()).toEqual([
      { outcome: "unavailable", workId: 7, error: "page.goto: Timeout 60000ms exceeded" },
    ]);
  });

  it("reports a deleted work without stopping the poll", async () => {
    browser.load.mockResolvedValue(page({ status: 404 }));

    expect(await checkWork({ workId: 7, kind: "refresh" }, settings, deps)).toBe(true);
    expect(postedResults()).toEqual([{ outcome: "not_found", workId: 7 }]);
  });

  it("uploads a backup Chrome saved as an attachment", async () => {
    browser.load.mockResolvedValue(page());
    api.postResult.mockResolvedValue({ status: "applied", backups: [backup] });
    const body = new Uint8Array([80, 75]);
    browser.download.mockResolvedValue({ status: 200, attachment: true, contentType: "", body });
    api.uploadBackup.mockResolvedValue("stored");

    await checkWork({ workId: 7, kind: "refresh" }, settings, deps);

    expect(browser.download).toHaveBeenCalledWith(backup.url);
    expect(api.uploadBackup).toHaveBeenCalledWith(7, backup, body);
  });

  it("uploads an inline response of the requested format", async () => {
    browser.load.mockResolvedValue(page());
    api.postResult.mockResolvedValue({ status: "applied", backups: [backup] });
    const body = new Uint8Array([80, 75]);
    browser.download.mockResolvedValue({
      status: 200,
      attachment: false,
      contentType: "application/epub+zip",
      body,
    });
    api.uploadBackup.mockResolvedValue("stored");

    await checkWork({ workId: 7, kind: "refresh" }, settings, deps);

    expect(api.uploadBackup).toHaveBeenCalledWith(7, backup, body);
  });

  it.each([
    ["a rendered page of another type", 200, "text/html; charset=utf-8"],
    ["a challenge or error page", 403, "text/html; charset=UTF-8"],
  ])("does not upload %s", async (_name, status, contentType) => {
    browser.load.mockResolvedValue(page());
    api.postResult.mockResolvedValue({ status: "applied", backups: [backup] });
    browser.download.mockResolvedValue({
      status,
      attachment: false,
      contentType,
      body: new Uint8Array(),
    });

    expect(await checkWork({ workId: 7, kind: "refresh" }, settings, deps)).toBe(true);
    expect(api.uploadBackup).not.toHaveBeenCalled();
  });

  it("keeps checking the poll when a backup download fails", async () => {
    browser.load.mockResolvedValue(page());
    api.postResult.mockResolvedValue({ status: "applied", backups: [backup] });
    browser.download.mockRejectedValue(
      new Error('Timeout 105000ms exceeded waiting for "download"'),
    );

    expect(await checkWork({ workId: 7, kind: "refresh" }, settings, deps)).toBe(true);
    expect(api.uploadBackup).not.toHaveBeenCalled();
  });
});

describe("polling", () => {
  it("claims nothing while the checker is disabled", async () => {
    api.settings.mockResolvedValue({ ...settings, enabled: false });

    await runPoll(deps);

    expect(api.claim).not.toHaveBeenCalled();
  });

  it("checks claimed works one at a time with the configured delay", async () => {
    api.settings.mockResolvedValue(settings);
    api.claim.mockResolvedValue([
      { workId: 7, kind: "refresh" },
      { workId: 8, kind: "missing" },
    ]);
    browser.load.mockResolvedValue(page());

    await runPoll(deps);

    expect(browser.load.mock.calls.map(([url]) => url)).toEqual([workUrl(7), workUrl(8)]);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2000);
  });

  it("ends the poll when AO3 is unavailable", async () => {
    api.settings.mockResolvedValue(settings);
    api.claim.mockResolvedValue([
      { workId: 7, kind: "refresh" },
      { workId: 8, kind: "refresh" },
    ]);
    browser.load.mockResolvedValue(page({ status: 503 }));

    await runPoll(deps);

    expect(browser.load).toHaveBeenCalledOnce();
  });
});
