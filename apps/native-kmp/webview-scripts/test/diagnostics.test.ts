import { afterEach, expect, it, vi } from "vite-plus/test";
import { installDiagnostics } from "../src/diagnostics";

afterEach(() => vi.restoreAllMocks());

it("waits for native consent, sends only allowed fields, and stops immediately on opt-out", () => {
  const handlers = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((event, handler) => {
    handlers.set(event, handler);
  });
  const post = vi.fn<(message: string) => void>();
  const tracker = installDiagnostics(post);
  const error = handlers.get("error");
  if (typeof error !== "function") throw new Error("Missing error listener");
  const event = new ErrorEvent("error", {
    message: "private search",
    filename: "https://archiveofourown.org/works/123",
  });
  error(event);
  tracker.capture({ event: "webview_action", action: "save_search" });
  expect(post).not.toHaveBeenCalled();
  tracker.setEnabled(true);
  error(event);
  expect(post.mock.calls.map(([raw]) => JSON.parse(raw))).toEqual([
    { type: "diagnostic", data: { event: "webview_ready" } },
    { type: "diagnostic", data: { event: "webview_error", kind: "script" } },
  ]);
  tracker.setEnabled(false);
  error(event);
  expect(post).toHaveBeenCalledTimes(2);
  tracker.setEnabled(true);
  expect(post).toHaveBeenCalledTimes(2);
});

it("caps repeated errors per document without sending rejection reasons", () => {
  const handlers = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((event, handler) => {
    handlers.set(event, handler);
  });
  const post = vi.fn<(message: string) => void>();
  const tracker = installDiagnostics(post);
  tracker.setEnabled(true);
  const reject = handlers.get("unhandledrejection");
  if (typeof reject !== "function") throw new Error("Missing rejection listener");
  for (let i = 0; i < 100; i++) reject(new Event("unhandledrejection"));
  expect(post).toHaveBeenCalledTimes(11);
  expect(JSON.parse(String(post.mock.calls[10]?.[0]))).toEqual({
    type: "diagnostic",
    data: { event: "webview_error", kind: "promise" },
  });
});
