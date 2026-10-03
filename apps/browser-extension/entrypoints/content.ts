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
  observeChapterProgress,
  applyHiddenWorks,
  installDefaultSearchTags,
  installSearchLanguage,
  installCrossoverLimit,
  withCrossoverLimit,
  applyFandomLimit,
  updateSavedSearchButton,
  withDefaultHiddenTags,
  withSearchLanguage,
} from "@qcksys/ao3tracker-core/dom";
import { applyListBadges, type WorkBadgeData } from "@qcksys/ao3tracker-core/badges";
import type { BrowsingState, WebViewMessage } from "@qcksys/ao3tracker-core/schemas";
import { backgroundToContentResponseSchema, type ContentToBackground } from "@/lib/messaging";
import { browsingPreferencesItem, savedSearchesItem } from "@/lib/storage";
import { showSaveSearchDialog } from "@/lib/save-search-dialog";

export default defineContentScript({
  matches: ["https://archiveofourown.org/*"],
  runAt: "document_end",
  async main(ctx) {
    if ((window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized) return;
    (window as Window & { __ao3TrackerInitialized?: boolean }).__ao3TrackerInitialized = true;

    const send = async (msg: ContentToBackground) =>
      backgroundToContentResponseSchema.parse(await browser.runtime.sendMessage(msg));

    let browsingState: BrowsingState = {
      hideCaughtUp: false,
      hideTracked: false,
      hiddenWorkTitles: {},
      hiddenTags: [],
      hiddenWorkIds: [],
      savedSearchUrls: [],
      languageFilterEnabled: false,
      searchLanguage: "en",
      maxFandoms: null,
    };
    let badges: WorkBadgeData[] = [];
    const applyBrowsingState = (state: BrowsingState): void => {
      browsingState = state;
      const language = state.languageFilterEnabled ? state.searchLanguage : null;
      const filteredUrl = withCrossoverLimit(
        withSearchLanguage(withDefaultHiddenTags(window.location.href, state.hiddenTags), language),
        state.maxFandoms,
      );
      if (filteredUrl !== window.location.href) {
        window.location.replace(filteredUrl);
        return;
      }
      updateSavedSearchButton(
        document,
        window.location.href,
        state.savedSearchUrls,
        state.hiddenTags,
        language,
        state.maxFandoms,
      );
      applyHiddenWorks(
        document,
        state.hiddenWorkIds,
        (workId, hidden, title) => {
          void send({ kind: "setWorkHidden", workId, hidden, title })
            .then((response) => {
              if (response.kind === "browsingState") applyBrowsingState(response.state);
              else if (response.kind === "error") throw new Error(response.message);
            })
            .catch(() => window.alert("Could not update hidden works. Please try again."));
        },
        { hideCaughtUp: state.hideCaughtUp, hideTracked: state.hideTracked, badges },
      );
      applyFandomLimit(document, state.maxFandoms);
    };
    const refreshBrowsingState = async (): Promise<void> => {
      const response = await send({ kind: "getBrowsingState" });
      if (response.kind === "browsingState") applyBrowsingState(response.state);
    };
    ctx.onInvalidated(
      installDefaultSearchTags(document, window.location, () => browsingState.hiddenTags),
    );
    ctx.onInvalidated(
      installSearchLanguage(document, window.location, () =>
        browsingState.languageFilterEnabled ? browsingState.searchLanguage : null,
      ),
    );

    ctx.onInvalidated(
      installCrossoverLimit(document, window.location, () => browsingState.maxFandoms),
    );

    const postPageEvent = (payload: WebViewMessage): void => {
      void send({ kind: "pageEvent", payload }).catch((err) => {
        console.warn("[ao3-tracker] page event failed", err);
      });
    };

    const { isWork, isChapterIndex } = classifyAo3Url(window.location.href);

    if (isWork) {
      postPageEvent(getWorkInfo(document, window.location));
      postPageEvent(getWorkTagInfo(document, window.location));

      const chapterSelect = getWorkChapterSelect(document, window.location);
      if (chapterSelect) postPageEvent(chapterSelect);
      ctx.onInvalidated(observeChapterProgress(document, window, postPageEvent));
    }

    if (isChapterIndex) {
      postPageEvent(getWorkChapterIndex(document, window.location));
    }

    consumeScrollToParam(document, window);

    let dismissSaveSearch: (() => void) | undefined;
    ctx.onInvalidated(() => dismissSaveSearch?.());
    injectSaveSearchButton(document, window.location, (url, button) => {
      button.disabled = true;
      void savedSearchesItem
        .getValue()
        .then((searches) => {
          dismissSaveSearch?.();
          dismissSaveSearch = showSaveSearchDialog(
            document,
            suggestSavedSearchName(document, url),
            searches,
            async (choice) => {
              const res = await send({ ...choice, url });
              if (res.kind === "error") throw new Error(res.message);
              if (res.kind !== "ok") throw new Error("Could not save. Please try again.");
              await refreshBrowsingState();
            },
          );
          button.disabled = false;
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
          badges = res.entries;
          applyListBadges(document, window, res.entries);
          applyBrowsingState(browsingState);
        }
      } catch (err) {
        console.warn("[ao3-tracker] badge fetch failed", err);
      }
    }
  },
});
