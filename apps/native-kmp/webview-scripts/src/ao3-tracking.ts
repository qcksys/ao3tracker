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
import { applyListBadges as applyBadges, type WorkBadgeData } from "@qcksys/ao3tracker-core/badges";
import {
  applyFandomLimit,
  applyHiddenWorks,
  classifyAo3Url,
  computeChapterScrollPercentage,
  consumeScrollToParam,
  extractChapterId,
  findListWorkIds,
  getWorkChapterIndex,
  getWorkChapterSelect,
  getWorkInfo,
  getWorkTagInfo,
  injectSaveSearchButton,
  installCrossoverLimit,
  installDefaultSearchTags,
  installSearchLanguage,
  observeChapterProgress,
  suggestSavedSearchName,
  updateSavedSearchButton,
  withCrossoverLimit,
  withDefaultHiddenTags,
  withSearchLanguage,
} from "@qcksys/ao3tracker-core/dom";
import type {
  BrowsingReadyMessage,
  BrowsingState,
  ListWorksMessage,
  SaveSearchMessage,
  ScrollProgressMessage,
  SetWorkHiddenMessage,
} from "@qcksys/ao3tracker-core/schemas";
import { installDiagnostics } from "./diagnostics";

declare global {
  interface Window {
    __ao3TrackerInitialized?: boolean;
    __ao3TrackerDiagnostics?: ReturnType<typeof installDiagnostics>;
    __ao3Tracker?: {
      applyListBadges(payloadJson: string): void;
      reportReadingActivity(): void;
      applyBrowsingState(payloadJson: string): void;
      setDiagnosticsEnabled(enabled: boolean): void;
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

let diagnostics: ReturnType<typeof installDiagnostics> | undefined;
if (typeof window !== "undefined") {
  window.__ao3TrackerDiagnostics ??= installDiagnostics(postMessage);
  diagnostics = window.__ao3TrackerDiagnostics;
}

function setDiagnosticsEnabled(enabled: boolean): void {
  diagnostics?.setEnabled(enabled);
}

let browsingState: BrowsingState = {
  hideCaughtUp: false,
  hideTracked: false,
  hiddenWorkTitles: {},
  hiddenWorkIds: [],
  hiddenTags: [],
  savedSearchUrls: [],
  languageFilterEnabled: false,
  searchLanguage: "en",
  maxFandoms: null,
};

let badges: WorkBadgeData[] = [];

export function applyBrowsingState(payloadJson: string): void {
  browsingState = JSON.parse(payloadJson) as BrowsingState;
  const language = browsingState.languageFilterEnabled ? browsingState.searchLanguage : null;
  const filteredUrl = withCrossoverLimit(
    withSearchLanguage(
      withDefaultHiddenTags(window.location.href, browsingState.hiddenTags),
      language,
    ),
    browsingState.maxFandoms,
  );
  if (filteredUrl !== window.location.href) {
    window.location.replace(filteredUrl);
    return;
  }
  updateSavedSearchButton(
    document,
    window.location.href,
    browsingState.savedSearchUrls,
    browsingState.hiddenTags,
    language,
    browsingState.maxFandoms,
  );
  applyHiddenWorks(
    document,
    browsingState.hiddenWorkIds,
    (workId, hidden, title) => {
      diagnostics?.capture({ event: "webview_action", action: hidden ? "hide_work" : "show_work" });
      postMessage(
        JSON.stringify({
          type: "setWorkHidden",
          url: window.location.href,
          workId,
          hidden,
          title,
        } satisfies SetWorkHiddenMessage),
      );
    },
    { hideCaughtUp: browsingState.hideCaughtUp, hideTracked: browsingState.hideTracked, badges },
  );
  applyFandomLimit(document, browsingState.maxFandoms);
}

export function applyListBadges(payloadJson: string): void {
  let entries: WorkBadgeData[];
  try {
    entries = JSON.parse(payloadJson) as WorkBadgeData[];
  } catch {
    return;
  }
  applyBadges(document, window, entries);
  badges = entries;
  applyBrowsingState(JSON.stringify(browsingState));
}

function reportPageMetadata(): void {
  const { isWork, isChapterIndex } = classifyAo3Url(window.location.href);

  if (isWork) {
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
}

let restoringScroll = false;

export function reportReadingActivity(): void {
  reportPageMetadata();
  if (restoringScroll || !classifyAo3Url(window.location.href).isWork) return;

  const percentage = computeChapterScrollPercentage(document, window);
  if (percentage === null || Number.isNaN(percentage)) return;
  const scrollPercentage = Math.floor(percentage);
  const url = new URL(window.location.href);
  url.searchParams.set("scroll", String(scrollPercentage));
  window.history.replaceState({}, "", url.toString());
  // Resuming tracking must report even when the URL already records this position.
  const message: ScrollProgressMessage = {
    type: "scrollProgress",
    url: url.toString(),
    chapterId: extractChapterId(document, window.location),
    scrollPercentage,
  };
  postMessage(JSON.stringify(message));
}

function init(): void {
  reportPageMetadata();
  const startProgressTracking = (): void => {
    restoringScroll = false;
    if (classifyAo3Url(window.location.href).isWork) {
      observeChapterProgress(document, window, (message) => postMessage(JSON.stringify(message)));
    }
  };
  restoringScroll = consumeScrollToParam(document, window, startProgressTracking);
  if (!restoringScroll) startProgressTracking();

  injectSaveSearchButton(document, window.location, (href) => {
    const url = withDefaultHiddenTags(href, browsingState.hiddenTags);
    diagnostics?.capture({ event: "webview_action", action: "save_search" });
    const message: SaveSearchMessage = {
      type: "saveSearch",
      url,
      name: suggestSavedSearchName(document, url),
    };
    postMessage(JSON.stringify(message));
  });

  installDefaultSearchTags(document, window.location, () => browsingState.hiddenTags);
  installCrossoverLimit(document, window.location, () => browsingState.maxFandoms);
  installSearchLanguage(document, window.location, () =>
    browsingState.languageFilterEnabled ? browsingState.searchLanguage : null,
  );
  postMessage(
    JSON.stringify({
      type: "browsingReady",
      url: window.location.href,
    } satisfies BrowsingReadyMessage),
  );

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
  window.__ao3Tracker = window.__ao3Tracker ?? {
    applyListBadges,
    reportReadingActivity,
    applyBrowsingState,
    setDiagnosticsEnabled,
  };
  window.__ao3Tracker.applyListBadges = applyListBadges;
  window.__ao3Tracker.reportReadingActivity = reportReadingActivity;
  window.__ao3Tracker.applyBrowsingState = applyBrowsingState;
  window.__ao3Tracker.setDiagnosticsEnabled = setDiagnosticsEnabled;
}

if (typeof window !== "undefined" && !window.__ao3TrackerInitialized) {
  window.__ao3TrackerInitialized = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
