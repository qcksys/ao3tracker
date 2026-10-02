import type { WebViewDiagnostic } from "@qcksys/ao3tracker-core/diagnostics";

export function installDiagnostics(post: (message: string) => void) {
  let enabled = false;
  let reportedReady = false;
  let errors = 0;
  const capture = (data: WebViewDiagnostic) => {
    if (enabled) post(JSON.stringify({ type: "diagnostic", data }));
  };
  const reportError = (kind: "script" | "promise") => {
    if (!enabled || errors >= 10) return;
    errors++;
    capture({ event: "webview_error", kind });
  };
  window.addEventListener("error", () => reportError("script"));
  window.addEventListener("unhandledrejection", () => reportError("promise"));
  return {
    capture,
    setEnabled(value: boolean) {
      enabled = value === true;
      if (enabled && !reportedReady) {
        reportedReady = true;
        capture({ event: "webview_ready" });
      }
    },
  };
}
