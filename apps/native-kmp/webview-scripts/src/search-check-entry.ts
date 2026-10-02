import { savedSearchKey } from "@qcksys/ao3tracker-core/dom";
import type { SearchCheckMessage } from "@qcksys/ao3tracker-core/schemas";
import { checkSearch } from "./search-check";

declare global {
  interface Window {
    __ao3SearchCheckOptions?: {
      url: string;
      hiddenTags: string[];
      hiddenWorkIds: number[];
      language: string | null;
      maxFandoms: number | null;
      previousContext: string | null;
      since: number | null;
      fullScan: boolean;
      resumeUrl: string | null;
    };
    __ao3SearchCheckStarted?: boolean;
  }
}

const post = (message: SearchCheckMessage): void => {
  const body = JSON.stringify(message);
  if (window.AndroidBridge) window.AndroidBridge.postMessage(body);
  else window.webkit?.messageHandlers?.ao3Handler?.postMessage(body);
};

const options = window.__ao3SearchCheckOptions;
if (window.top === window && options && !window.__ao3SearchCheckStarted) {
  window.__ao3SearchCheckStarted = true;
  if (
    !savedSearchKey(options.url) ||
    savedSearchKey(location.href) !== savedSearchKey(options.url)
  ) {
    post({
      type: "searchCheckError",
      error: "Open this search to check for a login or redirect, then try again.",
    });
  } else {
    void checkSearch(
      document,
      location.href,
      options.hiddenTags,
      options.hiddenWorkIds,
      options.language,
      post,
      undefined,
      undefined,
      options.maxFandoms,
      options,
    );
  }
}
