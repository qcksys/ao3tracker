import {
  applyListBadges,
  classifyAo3Url,
  consumeScrollToParam,
  findListWorkIds,
  getWorkChapterIndex,
  getWorkChapterSelect,
  getWorkInfo,
  getWorkTagInfo,
  publishScrollPercentage,
  type WebViewMessage,
} from "@qcksys/ao3tracker-core";
import type {
  BackgroundToContentResponse,
  ContentToBackground,
} from "@/lib/messaging";

export default defineContentScript({
  matches: ["*://*.archiveofourown.org/*"],
  runAt: "document_end",
  async main() {
    if ((window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized) return;
    (window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized = true;

    const send = (msg: ContentToBackground): Promise<BackgroundToContentResponse> =>
      browser.runtime.sendMessage(msg) as Promise<BackgroundToContentResponse>;

    const postPageEvent = (payload: WebViewMessage): void => {
      void send({ kind: "pageEvent", payload }).catch((err) => {
        console.warn("[ao3-tracker] page event failed", err);
      });
    };

    const onScroll = (): void => {
      const message = publishScrollPercentage(document, window);
      if (message) postPageEvent(message);
    };

    const { isWork, isChapterIndex } = classifyAo3Url(window.location.href);

    if (isWork) {
      window.addEventListener("scroll", onScroll, { passive: true });
      postPageEvent(getWorkInfo(document, window.location));
      postPageEvent(getWorkTagInfo(document, window.location));

      const chapterSelect = getWorkChapterSelect(document, window.location);
      if (chapterSelect) postPageEvent(chapterSelect);
    }

    if (isChapterIndex) {
      postPageEvent(getWorkChapterIndex(document, window.location));
    }

    consumeScrollToParam(document, window);

    const listWorkIds = findListWorkIds(document);
    if (listWorkIds.length > 0) {
      postPageEvent({
        type: "listWorks",
        url: window.location.href,
        workIds: listWorkIds,
      });

      try {
        const res = await send({ kind: "requestBadges", workIds: listWorkIds });
        if (res.kind === "badges") {
          applyListBadges(document, window, res.entries);
        }
      } catch (err) {
        console.warn("[ao3-tracker] badge fetch failed", err);
      }
    }
  },
});
