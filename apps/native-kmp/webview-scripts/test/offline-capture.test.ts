import { captureOfflinePage, prepareOfflinePage } from "@qcksys/ao3tracker-core/offline";
import type { OfflineBundle, OfflineCaptureMessage } from "@qcksys/ao3tracker-core/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createOfflineCapture } from "~/offline-capture";

vi.mock("@qcksys/ao3tracker-core/offline", async (original) => {
  const module = await original<typeof import("@qcksys/ao3tracker-core/offline")>();
  return { ...module, captureOfflinePage: vi.fn(), prepareOfflinePage: vi.fn() };
});

const url = "https://archiveofourown.org/works/123";
const bundle: OfflineBundle = {
  page: {
    version: 1,
    url,
    workId: "123",
    chapterId: "0",
    representation: "chapter",
    title: "Story",
    ao3Identity: "guest",
    canSelectSkin: true,
    html: "<p>Story</p>",
    siteStyles: [],
    chapters: [],
  },
  skinHash: "a".repeat(64),
  resources: [],
  missingResources: [],
};

function setup() {
  const messages: OfflineCaptureMessage[] = [];
  const capture = createOfflineCapture("active", (message) => messages.push(message));
  function reply(id: string, body: unknown, token = "active") {
    capture.receive({ token, id, index: 0, total: 1, text: JSON.stringify(body) });
  }
  return { messages, capture, reply };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(captureOfflinePage).mockReturnValue({ page: bundle.page, stylesheets: [] });
  vi.mocked(prepareOfflinePage).mockResolvedValue(bundle);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("offline capture transport", () => {
  it("waits for each resource acknowledgement before publishing the chapter", async () => {
    const { capture, messages, reply } = setup();
    const resource = { hash: "b".repeat(64), mimeType: "image/png", bytes: 3, base64: "YWJj" };
    vi.mocked(prepareOfflinePage).mockImplementationOnce(async (_page, fetch, _digest, persist) => {
      const result = await fetch("https://images.example/story.png");
      expect([...result.bytes]).toEqual([97, 98, 99]);
      await persist?.(resource);
      return bundle;
    });
    const running = capture.run(document, url, url);
    expect(messages).toEqual([
      { type: "offlineFetch", token: "active", id: "1", url: "https://images.example/story.png" },
    ]);
    reply("1", { url: "https://images.example/story.png", mimeType: "image/png", base64: "YWJj" });
    await vi.advanceTimersByTimeAsync(0);
    expect(messages.at(-1)).toMatchObject({
      type: "offlineTransfer",
      kind: "resource",
      transferId: "2",
    });
    expect(messages.some((m) => m.type === "offlineTransfer" && m.kind === "bundle")).toBe(false);
    reply("2", {});
    await vi.advanceTimersByTimeAsync(0);
    expect(messages.at(-1)).toMatchObject({
      type: "offlineTransfer",
      kind: "bundle",
      transferId: "3",
    });
    reply("3", {});
    await running;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds each outgoing chunk and reconstructs a large Unicode chapter", async () => {
    const { capture, messages, reply } = setup();
    const large = { ...bundle, page: { ...bundle.page, html: "📚".repeat(20_000) } };
    vi.mocked(prepareOfflinePage).mockResolvedValueOnce(large);
    const running = capture.run(document, url, url);
    await vi.advanceTimersByTimeAsync(0);
    const chunks = messages.filter((m) => m.type === "offlineTransfer");
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every(
        (chunk, index) =>
          chunk.text.length <= 16_384 && chunk.index === index && chunk.total === chunks.length,
      ),
    ).toBe(true);
    expect(JSON.parse(chunks.map((chunk) => chunk.text).join(""))).toEqual(large);
    reply("1", {});
    await running;
  });

  it("rejects a native storage failure without reporting a completed download", async () => {
    const { capture, messages, reply } = setup();
    const running = capture.run(document, url, url);
    await vi.advanceTimersByTimeAsync(0);
    reply("1", { error: "Not enough storage." });
    await running;
    expect(messages.at(-1)).toEqual({
      type: "offlineFailure",
      token: "active",
      message: "Not enough storage.",
    });
  });

  it("ignores another document's response and fails a timed-out transfer", async () => {
    const { capture, messages, reply } = setup();
    const running = capture.run(document, url, url);
    await vi.advanceTimersByTimeAsync(0);
    reply("1", {}, "old-document");
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await running;
    expect(messages.at(-1)).toMatchObject({
      type: "offlineFailure",
      message: "The download timed out. Try again.",
    });
  });

  it("rejects unordered or oversized responses and clears their timers", async () => {
    for (const response of [
      { index: 1, total: 2, text: "late" },
      { index: 0, total: 2049, text: "too many" },
      { index: 0, total: 1, text: "x".repeat(16_385) },
    ]) {
      const { capture, messages } = setup();
      const running = capture.run(document, url, url);
      await vi.advanceTimersByTimeAsync(0);
      capture.receive({ token: "active", id: "1", ...response });
      await running;
      expect(messages.at(-1)).toMatchObject({
        type: "offlineFailure",
        message: "The download response was incomplete.",
      });
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("cancels pending transfers without another bridge message", async () => {
    const { capture, messages, reply } = setup();
    const running = capture.run(document, url, url);
    await vi.advanceTimersByTimeAsync(0);
    const count = messages.length;
    capture.cancel();
    reply("1", {});
    await running;
    expect(messages).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses to capture a different work after navigation", async () => {
    const { capture, messages } = setup();
    await capture.run(document, "https://archiveofourown.org/works/456", url);
    expect(captureOfflinePage).not.toHaveBeenCalled();
    expect(messages).toEqual([
      {
        type: "offlineFailure",
        token: "active",
        message: "Open the requested chapter before saving it.",
      },
    ]);
  });
});
