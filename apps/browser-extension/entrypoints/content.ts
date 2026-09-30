import {
  applyListBadges,
  classifyAo3Url,
  consumeScrollToParam,
  findListWorkIds,
  getWorkChapterIndex,
  getWorkChapterSelect,
  getWorkInfo,
  getWorkTagInfo,
  injectSaveSearchButton,
  publishScrollPercentage,
  SAVE_SEARCH_LABEL,
  type WebViewMessage,
} from "@qcksys/ao3tracker-core";
import type { BackgroundToContentResponse, ContentToBackground } from "@/lib/messaging";

export default defineContentScript({
  matches: ["https://archiveofourown.org/*"],
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

    // On filterable list/search pages, offer a "Save this search" button that
    // names + persists the current filter URL (synced via the background).
    let saveFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
    const flashSaveButton = (button: HTMLButtonElement, label: string): void => {
      if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
      button.textContent = label;
      saveFeedbackTimer = setTimeout(() => {
        button.textContent = SAVE_SEARCH_LABEL;
      }, 2000);
    };
    injectSaveSearchButton(document, window.location, (url, button) => {
      const heading = document.querySelector("#main h2.heading")?.textContent?.trim();
      const suggested = heading && heading.length > 0 ? heading : "AO3 search";
      const name = window.prompt("Name this saved search:", suggested);
      if (!name || name.trim().length === 0) return;
      void send({ kind: "saveSearch", name: name.trim(), url })
        .then((res) => {
          if (res.kind === "ok") {
            flashSaveButton(button, "Saved ✓");
          } else if (res.kind === "error") {
            flashSaveButton(button, "Couldn't save");
            console.warn("[ao3-tracker] save search rejected", res.message);
          }
        })
        .catch((err) => {
          flashSaveButton(button, "Couldn't save");
          console.warn("[ao3-tracker] save search failed", err);
        });
    });

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
