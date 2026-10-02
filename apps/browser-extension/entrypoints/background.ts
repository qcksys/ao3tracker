import type {
  BackgroundToContentResponse,
  BackgroundToPopupResponse,
  ContentToBackground,
  PopupState,
  PopupToBackground,
} from "@/lib/messaging";
import { contentToBackgroundSchema, popupToBackgroundSchema } from "@/lib/messaging";
import { loadAuthToken } from "@/lib/auth-token-cache";
import { toggleFavouriteTag } from "@/lib/favourite-tags-repo";
import { deleteSavedSearch, renameSavedSearch, saveSearch } from "@/lib/saved-searches-repo";
import { attachNotificationClickHandler, pollAndDisplayNotifications } from "@/lib/notifications";
import {
  apiBaseUrlItem,
  authTokenItem,
  favouriteTagsItem,
  lastSyncErrorItem,
  lastSyncedAtItem,
  getNotificationPreferences,
  notificationPreferencesItem,
  resolveApiBaseUrl,
  savedSearchesItem,
} from "@/lib/storage";
import { runSync, StaleSyncSessionError } from "@/lib/sync";
import { initializeAccount, setApiEndpoint, setAuthSession } from "@/lib/account-state";
import { withLocalState } from "@/lib/local-state";
import {
  getBrowsingState,
  setHiddenTags,
  setSearchLanguage,
  setWorkHidden,
} from "@/lib/browsing-repo";
import { browsingPreferencesItem } from "@/lib/storage";
import {
  buildBadgePayloads,
  currentWorkSummary,
  ingestPageEvent,
  trackedWorkCount,
} from "@/lib/tracker-repo";

const SYNC_DEBOUNCE_MS = 2_000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let syncRequested = false;

/** True when `url` is served from an AO3 host (archiveofourown.org or a subdomain). */
function isAo3Url(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { host } = new URL(url);
    return host === "archiveofourown.org" || host.endsWith(".archiveofourown.org");
  } catch {
    return false;
  }
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void triggerSync();
  }, SYNC_DEBOUNCE_MS);
}

async function triggerSync(): Promise<void> {
  if (syncing) {
    syncRequested = true;
    return;
  }
  syncing = true;
  try {
    await runSync();
  } catch (err) {
    if (err instanceof StaleSyncSessionError) return;
    const message = err instanceof Error ? err.message : String(err);
    await lastSyncErrorItem.setValue(message);
    console.warn("[ao3-tracker] sync failed", err);
  } finally {
    syncing = false;
    if (syncRequested) {
      syncRequested = false;
      scheduleSync();
    }
  }
}

async function pollNotifications(): Promise<void> {
  try {
    await pollAndDisplayNotifications();
  } catch (err) {
    console.warn("[ao3-tracker] notification poll failed", err);
  }
}

async function getPopupState(): Promise<PopupState> {
  const [
    baseUrl,
    lastSyncedAt,
    lastSyncError,
    favouriteTags,
    savedSearches,
    currentWork,
    trackedCount,
    notificationPreferences,
    browsingPreferences,
  ] = await Promise.all([
    apiBaseUrlItem.getValue(),
    lastSyncedAtItem.getValue(),
    lastSyncErrorItem.getValue(),
    favouriteTagsItem.getValue(),
    savedSearchesItem.getValue(),
    currentWorkSummary(),
    trackedWorkCount(),
    getNotificationPreferences(),
    browsingPreferencesItem.getValue(),
  ]);
  return {
    // Coerce so the popup's "Active" endpoint matches what requests actually
    // use (every network/auth consumer routes through resolveApiBaseUrl).
    apiBaseUrl: resolveApiBaseUrl(baseUrl),
    lastSyncedAt,
    lastSyncError,
    syncing,
    trackedCount,
    notificationPreferences,
    browsingPreferences,
    currentWork,
    favouriteTags,
    savedSearches,
  };
}

async function handleContentMessage(
  msg: ContentToBackground,
): Promise<BackgroundToContentResponse> {
  switch (msg.kind) {
    case "getBrowsingState":
      return { kind: "browsingState", state: await getBrowsingState() };
    case "setWorkHidden":
      await setWorkHidden(msg.workId, msg.hidden);
      return { kind: "browsingState", state: await getBrowsingState() };
    case "pageEvent": {
      const affected = await ingestPageEvent(msg.payload);
      if (affected.length > 0) scheduleSync();
      return { kind: "ok" };
    }
    case "requestBadges": {
      const entries = await buildBadgePayloads(msg.workIds);
      return { kind: "badges", entries };
    }
    case "saveSearch": {
      await saveSearch(msg.name, msg.url);
      scheduleSync();
      return { kind: "ok" };
    }
  }
}

async function handlePopupMessage(msg: PopupToBackground): Promise<BackgroundToPopupResponse> {
  switch (msg.kind) {
    case "unhideWork":
    case "setHiddenTags":
    case "setSearchLanguage":
      return withLocalState(async () => {
        if (msg.kind === "unhideWork") await setWorkHidden(msg.workId, false);
        else if (msg.kind === "setHiddenTags") await setHiddenTags(msg.hiddenTags);
        else
          await setSearchLanguage({
            languageFilterEnabled: msg.languageFilterEnabled,
            searchLanguage: msg.searchLanguage,
          });
        return { kind: "state", state: await getPopupState() };
      });
    case "getState":
      return withLocalState(async () => ({ kind: "state", state: await getPopupState() }));

    case "setAuthSession":
      await setAuthSession(msg.token, msg.baseUrl);
      return { kind: "ok" };

    case "setApiBaseUrl":
      await setApiEndpoint(msg.baseUrl);
      return { kind: "state", state: await getPopupState() };

    case "syncNow": {
      await triggerSync();
      return { kind: "state", state: await getPopupState() };
    }

    case "toggleFavouriteTag": {
      return withLocalState(async () => {
        await toggleFavouriteTag(msg.tagType, msg.tag, msg.favourited);
        scheduleSync();
        return { kind: "state", state: await getPopupState() };
      });
    }

    case "renameSavedSearch": {
      return withLocalState(async () => {
        await renameSavedSearch(msg.id, msg.name);
        scheduleSync();
        return { kind: "state", state: await getPopupState() };
      });
    }

    case "deleteSavedSearch": {
      return withLocalState(async () => {
        await deleteSavedSearch(msg.id);
        scheduleSync();
        return { kind: "state", state: await getPopupState() };
      });
    }

    case "setNotificationPreference": {
      return withLocalState(async () => {
        const preferences = await getNotificationPreferences();
        await notificationPreferencesItem.setValue({ ...preferences, [msg.key]: msg.enabled });
        return { kind: "state", state: await getPopupState() };
      });
    }
  }
}

export default defineBackground(() => {
  console.log("[ao3-tracker] background worker started", { id: browser.runtime.id });

  // Seed the token cache so the auth client can read synchronously, and
  // re-trigger sync whenever the popup signs in / out.
  void loadAuthToken();
  const initialized = initializeAccount();
  authTokenItem.watch((next) => {
    if (next) {
      scheduleSync();
      void pollNotifications();
    }
  });

  attachNotificationClickHandler();

  browser.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    // Only accept messages from our own extension's content scripts / popup.
    // External senders (other extensions, web pages) are rejected outright.
    if (sender.id !== browser.runtime.id) {
      sendResponse({ kind: "error", message: "Untrusted sender" });
      return false;
    }

    // The same channel handles content-script and popup messages. We try the
    // content-script schema first because it's the hot path; popup messages
    // will fail that parse and fall through to the popup schema.
    const fromContent = contentToBackgroundSchema.safeParse(rawMessage);
    if (fromContent.success) {
      // Content messages must originate from an AO3 page. This blocks a
      // malicious iframe embedded on an AO3 page (which would still pass the
      // sender.id check) from posting valid-shaped pageEvent payloads.
      if (!isAo3Url(sender.url)) {
        sendResponse({ kind: "error", message: "Untrusted sender" });
        return false;
      }
      void initialized
        .then(() => withLocalState(() => handleContentMessage(fromContent.data)))
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ kind: "error", message } satisfies BackgroundToContentResponse);
        });
      return true;
    }

    const fromPopup = popupToBackgroundSchema.safeParse(rawMessage);
    if (fromPopup.success) {
      if (!sender.url?.startsWith(browser.runtime.getURL("/"))) {
        sendResponse({ kind: "error", message: "Untrusted sender" });
        return false;
      }
      void initialized
        .then(() => handlePopupMessage(fromPopup.data))
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ kind: "error", message } satisfies BackgroundToPopupResponse);
        });
      return true;
    }

    sendResponse({ kind: "error", message: "Unknown message shape" });
    return true;
  });

  // Background sync every 5 minutes when signed in. Notifications poll on the
  // same cadence — they're a piggy-back on the sync alarm, no extra timer.
  void browser.alarms.create("ao3-tracker-periodic-sync", { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "ao3-tracker-periodic-sync") {
      void triggerSync();
      void pollNotifications();
    }
  });

  void initialized.then(triggerSync);
  void initialized.then(pollNotifications);
});
