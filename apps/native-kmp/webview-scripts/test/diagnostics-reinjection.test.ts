import { expect, it, vi } from "vite-plus/test";

it("keeps consent connected to the original listeners after script reinjection", async () => {
  const handlers = new Map<string, EventListenerOrEventListenerObject>();
  vi.spyOn(window, "addEventListener").mockImplementation((event, handler) => {
    handlers.set(event, handler);
  });
  const post = vi.fn<(message: string) => void>();
  window.AndroidBridge = { postMessage: post };
  try {
    await import("../src/ao3-tracking");
    window.__ao3Tracker?.setDiagnosticsEnabled(true);
    const originalError = handlers.get("error");
    if (typeof originalError !== "function") throw new Error("Missing error handler");
    vi.resetModules();
    await import("../src/ao3-tracking");
    expect(handlers.get("error")).toBe(originalError);
    window.__ao3Tracker?.setDiagnosticsEnabled(false);
    post.mockClear();
    originalError(new Event("error"));
    expect(post).not.toHaveBeenCalled();
    window.__ao3Tracker?.setDiagnosticsEnabled(true);
    originalError(new Event("error"));
    expect(post).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        type: "diagnostic",
        data: { event: "webview_error", kind: "script" },
      }),
    );
  } finally {
    delete window.AndroidBridge;
    delete window.__ao3Tracker;
    delete window.__ao3TrackerDiagnostics;
    delete window.__ao3TrackerInitialized;
    vi.restoreAllMocks();
  }
});
