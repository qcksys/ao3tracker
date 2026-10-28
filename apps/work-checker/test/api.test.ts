import { describe, expect, it, vi } from "vite-plus/test";
import { CheckerApiError, createCheckerApi } from "../src/api.ts";

const settings = {
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

function apiWith(response: Response) {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { fetchFn, api: createCheckerApi("https://dev.ao3tracker.com", "secret", fetchFn) };
}

describe("checker API client", () => {
  it("authenticates every request and validates the response", async () => {
    const { fetchFn, api } = apiWith(Response.json(settings));

    expect(await api.settings()).toEqual(settings);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://dev.ao3tracker.com/checker/settings");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret");
  });

  it("throws on a failed request", async () => {
    const { api } = apiWith(new Response(null, { status: 401 }));

    await expect(api.claim()).rejects.toBeInstanceOf(CheckerApiError);
  });

  it("rejects a response that does not match the contract", async () => {
    const { api } = apiWith(Response.json({ jobs: [{ workId: "7" }] }));

    await expect(api.claim()).rejects.toThrow();
  });

  it("posts a status report", async () => {
    const { fetchFn, api } = apiWith(new Response(null, { status: 204 }));
    const status = {
      checkerId: "hub-dev",
      version: "abc1234",
      startedAt: "2026-10-28T08:00:00.000Z",
      lastPoll: null,
      lastError: null,
    };

    await api.postStatus(status);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://dev.ao3tracker.com/checker/status");
    expect(JSON.parse(init?.body as string)).toEqual(status);
  });

  it("uploads a backup with its download revision", async () => {
    const { fetchFn, api } = apiWith(Response.json({ outcome: "stored" }));

    expect(await api.uploadBackup(7, backup, new Uint8Array([1]))).toBe("stored");
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://dev.ao3tracker.com/checker/backups/7/epub?downloadUpdatedAt=1731356383",
    );
  });

  it("treats a superseded revision as an outcome, not a failure", async () => {
    const { api } = apiWith(Response.json({ outcome: "superseded" }, { status: 409 }));

    expect(await api.uploadBackup(7, backup, new Uint8Array([1]))).toBe("superseded");
  });
});
