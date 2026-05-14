/**
 * AO3 Tracking Script — native-app variant.
 *
 * Extracts work metadata and scroll progress, posting JSON messages back to
 * the host platform via the AndroidBridge / WKWebKit / desktop bridge.
 *
 * Pure DOM logic and the WebViewMessage protocol now live in
 * `@qcksys/ao3tracker-core`; this file is the native-WebView entry that wires those
 * helpers to the platform-specific `postMessage` channels.
 */
import {
  applyListBadges as applyBadges,
  type WorkBadgeData,
} from "@qcksys/ao3tracker-core/badges";
import {
  classifyAo3Url,
  consumeScrollToParam,
  findListWorkIds,
  getWorkChapterIndex,
  getWorkChapterSelect,
  getWorkInfo,
  getWorkTagInfo,
  publishScrollPercentage,
} from "@qcksys/ao3tracker-core/dom";
import type { ListWorksMessage } from "@qcksys/ao3tracker-core/schemas";

export {};

declare global {
  interface Window {
    __ao3TrackerInitialized?: boolean;
    __ao3Tracker?: {
      applyListBadges(payloadJson: string): void;
    };
    AndroidBridge?: {
      postMessage(msg: string): void;
    };
    webkit?: {
      messageHandlers?: {
        ao3Handler?: {
          postMessage(msg: string): void;
        };
      };
    };
    ao3Bridge?: (msg: string) => void;
  }
}

function postMessage(msg: string): void {
  if (window.AndroidBridge) {
    window.AndroidBridge.postMessage(msg);
  } else if (window.webkit?.messageHandlers?.ao3Handler) {
    window.webkit.messageHandlers.ao3Handler.postMessage(msg);
  } else if (window.ao3Bridge) {
    window.ao3Bridge(msg);
  }
}

function updateScrollAndPost(): void {
  const message = publishScrollPercentage(document, window);
  if (message) postMessage(JSON.stringify(message));
}

export function applyListBadges(payloadJson: string): void {
  let entries: WorkBadgeData[];
  try {
    entries = JSON.parse(payloadJson) as WorkBadgeData[];
  } catch {
    return;
  }
  applyBadges(document, window, entries);
}

function init(): void {
  const { isWork, isChapterIndex } = classifyAo3Url(window.location.href);

  if (isWork) {
    window.addEventListener("scroll", updateScrollAndPost);
    postMessage(JSON.stringify(getWorkInfo(document, window.location)));
    postMessage(JSON.stringify(getWorkTagInfo(document, window.location)));

    const chapterSelect = getWorkChapterSelect(document, window.location);
    if (chapterSelect) {
      postMessage(JSON.stringify(chapterSelect));
    }
  }

  if (isChapterIndex) {
    postMessage(JSON.stringify(getWorkChapterIndex(document, window.location)));
  }

  consumeScrollToParam(document, window);

  const listWorkIds = findListWorkIds(document);
  if (listWorkIds.length > 0) {
    const message: ListWorksMessage = {
      type: "listWorks",
      url: window.location.href,
      workIds: listWorkIds,
    };
    postMessage(JSON.stringify(message));
  }
}

if (typeof window !== "undefined") {
  window.__ao3Tracker = window.__ao3Tracker ?? { applyListBadges };
  window.__ao3Tracker.applyListBadges = applyListBadges;
}

if (typeof window !== "undefined" && !window.__ao3TrackerInitialized) {
  window.__ao3TrackerInitialized = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
