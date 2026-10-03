import { trustedAo3Url } from "@qcksys/ao3tracker-core/offline";
import { createOfflineCapture } from "./offline-capture";

declare global {
  interface Window {
    __ao3OfflineOptions?: { token: string; url: string };
    __ao3OfflineCapture?: ReturnType<typeof createOfflineCapture>;
    OfflineCaptureBridge?: { postMessage: (body: string) => void };
  }
}

const options = window.__ao3OfflineOptions;
if (window.top === window && options && trustedAo3Url(location.href)) {
  window.__ao3OfflineCapture?.cancel();
  const capture = createOfflineCapture(options.token, (message) => {
    const body = JSON.stringify(message);
    window.OfflineCaptureBridge?.postMessage(body);
  });
  window.__ao3OfflineCapture = capture;
  void capture.run(document, location.href, options.url);
}
