import {
  classifyAo3Url,
  consumeScrollToParam,
  findListWorkIds,
  getWorkChapterIndex,
  getWorkChapterSelect,
  getWorkInfo,
  getWorkTagInfo,
  suggestSavedSearchName,
  injectSaveSearchButton,
  publishScrollPercentage,
  applyHiddenWorks,
  installDefaultSearchTags,
  updateSavedSearchButton,
  withDefaultHiddenTags,
} from "@qcksys/ao3tracker-core/dom";
import { applyListBadges } from "@qcksys/ao3tracker-core/badges";
import type { BrowsingState, WebViewMessage } from "@qcksys/ao3tracker-core/schemas";
import { backgroundToContentResponseSchema, type ContentToBackground } from "@/lib/messaging";
import { browsingPreferencesItem, savedSearchesItem } from "@/lib/storage";

export default defineContentScript({
  matches: ["https://archiveofourown.org/*"],
  runAt: "document_end",
  async main(ctx) {
    if ((window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized) return;
    (window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized = true;

    const send = async (msg: ContentToBackground) =>
      backgroundToContentResponseSchema.parse(await browser.runtime.sendMessage(msg));

    let browsingState: BrowsingState = { hiddenTags: [], hiddenWorkIds: [], savedSearchUrls: [] };
    const applyBrowsingState = (state: BrowsingState): void => {
      browsingState = state;
      const filteredUrl = withDefaultHiddenTags(window.location.href, state.hiddenTags);
      if (filteredUrl !== window.location.href) {
        window.location.replace(filteredUrl);
        return;
      }
      updateSavedSearchButton(
        document,
        window.location.href,
        state.savedSearchUrls,
        state.hiddenTags,
      );
      applyHiddenWorks(document, state.hiddenWorkIds, (workId, hidden) => {
        void send({ kind: "setWorkHidden", workId, hidden })
          .then((response) => {
            if (response.kind === "browsingState") applyBrowsingState(response.state);
            else if (response.kind === "error") throw new Error(response.message);
          })
          .catch(() => window.alert("Could not update hidden works. Please try again."));
      });
    };
    const refreshBrowsingState = async (): Promise<void> => {
      const response = await send({ kind: "getBrowsingState" });
      if (response.kind === "browsingState") applyBrowsingState(response.state);
    };
    ctx.onInvalidated(
      installDefaultSearchTags(document, window.location, () => browsingState.hiddenTags),
    );

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

    injectSaveSearchButton(document, window.location, (url, button) => {
      const name = window.prompt("Name this saved search:", suggestSavedSearchName(document, url));
      if (!name || name.trim().length === 0) return;
      button.disabled = true;
      void send({ kind: "saveSearch", name: name.trim().slice(0, 191), url })
        .then(async (res) => {
          if (res.kind === "ok") {
            await refreshBrowsingState();
          } else if (res.kind === "error") {
            throw new Error(res.message);
          }
        })
        .catch((err) => {
          button.disabled = false;
          button.textContent = "Couldn't save — try again";
          console.warn("[ao3-tracker] save search failed", err);
        });
    });

    const refresh = () => {
      void refreshBrowsingState().catch((err) =>
        console.warn("[ao3-tracker] preferences failed", err),
      );
    };
    ctx.onInvalidated(browsingPreferencesItem.watch(refresh));
    ctx.onInvalidated(savedSearchesItem.watch(refresh));
    refresh();

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
