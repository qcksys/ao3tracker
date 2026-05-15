import type {
  BackgroundToContentResponse,
  BackgroundToPopupResponse,
  ContentToBackground,
  PopupState,
  PopupToBackground,
} from "@/lib/messaging";
import {
  contentToBackgroundSchema,
  popupToBackgroundSchema,
} from "@/lib/messaging";
import { loadAuthToken } from "@/lib/auth-token-cache";
import { toggleFavouriteTag } from "@/lib/favourite-tags-repo";
import {
  attachNotificationClickHandler,
  pollAndDisplayNotifications,
} from "@/lib/notifications";
import {
  apiBaseUrlItem,
  authTokenItem,
  favouriteTagsItem,
  lastSeenNotificationIdItem,
  lastSyncErrorItem,
  lastSyncedAtItem,
  notificationsEnabledItem,
} from "@/lib/storage";
import { runSync } from "@/lib/sync";
import {
  buildBadgePayloads,
  currentWorkSummary,
  ingestPageEvent,
  trackedWorkCount,
} from "@/lib/tracker-repo";

const SYNC_DEBOUNCE_MS = 2_000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void triggerSync();
  }, SYNC_DEBOUNCE_MS);
}

async function triggerSync(): Promise<void> {
  if (syncing) return;
  const token = await authTokenItem.getValue();
  if (!token) return;
  syncing = true;
  try {
    await runSync();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await lastSyncErrorItem.setValue(message);
    console.warn("[ao3-tracker] sync failed", err);
  } finally {
    syncing = false;
  }
}

async function pollNotifications(): Promise<void> {
  const [enabled, lastSeenId] = await Promise.all([
    notificationsEnabledItem.getValue(),
    lastSeenNotificationIdItem.getValue(),
  ]);
  try {
    await pollAndDisplayNotifications({
      notificationsEnabled: enabled,
      lastSeenId,
      setLastSeenId: (id) => lastSeenNotificationIdItem.setValue(id),
    });
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
    currentWork,
    trackedCount,
    notificationsEnabled,
  ] = await Promise.all([
    apiBaseUrlItem.getValue(),
    lastSyncedAtItem.getValue(),
    lastSyncErrorItem.getValue(),
    favouriteTagsItem.getValue(),
    currentWorkSummary(),
    trackedWorkCount(),
    notificationsEnabledItem.getValue(),
  ]);
  return {
    apiBaseUrl: baseUrl,
    lastSyncedAt,
    lastSyncError,
    syncing,
    trackedCount,
    notificationsEnabled,
    currentWork,
    favouriteTags,
  };
}

async function handleContentMessage(
  msg: ContentToBackground,
): Promise<BackgroundToContentResponse> {
  switch (msg.kind) {
    case "pageEvent": {
      const affected = await ingestPageEvent(msg.payload);
      if (affected.length > 0) scheduleSync();
      return { kind: "ok" };
    }
    case "requestBadges": {
      const entries = await buildBadgePayloads(msg.workIds);
      return { kind: "badges", entries };
    }
  }
}

async function handlePopupMessage(
  msg: PopupToBackground,
): Promise<BackgroundToPopupResponse> {
  switch (msg.kind) {
    case "getState":
      return { kind: "state", state: await getPopupState() };

    case "setApiBaseUrl":
      await apiBaseUrlItem.setValue(msg.baseUrl);
      return { kind: "state", state: await getPopupState() };

    case "syncNow": {
      try {
        if (!syncing) {
          syncing = true;
          await runSync();
        }
        return { kind: "state", state: await getPopupState() };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await lastSyncErrorItem.setValue(message);
        return { kind: "error", message };
      } finally {
        syncing = false;
      }
    }

    case "toggleFavouriteTag": {
      await toggleFavouriteTag(msg.tagType, msg.tag, msg.favourited);
      scheduleSync();
      return { kind: "state", state: await getPopupState() };
    }

    case "setNotificationsEnabled": {
      await notificationsEnabledItem.setValue(msg.enabled);
      if (msg.enabled) void pollNotifications();
      return { kind: "state", state: await getPopupState() };
    }
  }
}

export default defineBackground(() => {
  console.log("[ao3-tracker] background worker started", { id: browser.runtime.id });

  // Seed the token cache so the auth client can read synchronously, and
  // re-trigger sync whenever the popup signs in / out.
  void loadAuthToken();
  authTokenItem.watch((next) => {
    if (next) {
      scheduleSync();
      void pollNotifications();
    }
  });

  attachNotificationClickHandler();

  browser.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    // The same channel handles content-script and popup messages. We try the
    // content-script schema first because it's the hot path; popup messages
    // will fail that parse and fall through to the popup schema.
    const fromContent = contentToBackgroundSchema.safeParse(rawMessage);
    if (fromContent.success) {
      void handleContentMessage(fromContent.data)
        .then(sendResponse)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ kind: "error", message } satisfies BackgroundToContentResponse);
        });
      return true;
    }

    const fromPopup = popupToBackgroundSchema.safeParse(rawMessage);
    if (fromPopup.success) {
      void handlePopupMessage(fromPopup.data)
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

  void triggerSync();
  void pollNotifications();
});
