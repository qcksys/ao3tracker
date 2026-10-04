import type { OfflineReaderOptions } from "@qcksys/ao3tracker-core/schemas";
import { installOfflineReader } from "./offline-reader";

declare global {
  interface Window {
    __ao3OfflineReaderOptions?: OfflineReaderOptions;
    __ao3OfflineReaderStop?: () => void;
    OfflineBridge?: { postMessage: (body: string) => void };
  }
}

const options = window.__ao3OfflineReaderOptions;
if (
  window.top === window &&
  options &&
  location.origin === "https://appassets.androidplatform.net"
) {
  window.__ao3OfflineReaderStop?.();
  window.__ao3OfflineReaderStop = installOfflineReader(document, window, options, (message) => {
    window.OfflineBridge?.postMessage(JSON.stringify(message));
  });
}
