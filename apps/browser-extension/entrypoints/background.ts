import {
  type SyncClientConfig,
  signInEmail,
  signOut as signOutCall,
  signUpEmail,
} from "@qcksys/ao3tracker-sync-client";
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
import { toggleFavouriteTag } from "@/lib/favourite-tags-repo";
import {
  apiBaseUrlItem,
  authTokenItem,
  favouriteTagsItem,
  lastSyncErrorItem,
  lastSyncedAtItem,
  userItem,
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

async function buildClientConfig(): Promise<SyncClientConfig> {
  const baseUrl = await apiBaseUrlItem.getValue();
  return {
    baseUrl,
    getBearerToken: () => authTokenItem.getValue(),
    includeCredentials: false,
  };
}

async function getPopupState(): Promise<PopupState> {
  const [baseUrl, token, user, lastSyncedAt, lastSyncError, favouriteTags, currentWork, trackedCount] =
    await Promise.all([
      apiBaseUrlItem.getValue(),
      authTokenItem.getValue(),
      userItem.getValue(),
      lastSyncedAtItem.getValue(),
      lastSyncErrorItem.getValue(),
      favouriteTagsItem.getValue(),
      currentWorkSummary(),
      trackedWorkCount(),
    ]);
  return {
    apiBaseUrl: baseUrl,
    authenticated: !!token,
    user,
    lastSyncedAt,
    lastSyncError,
    syncing,
    trackedCount,
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

    case "signIn": {
      const cfg = await buildClientConfig();
      const { token, userId } = await signInEmail(cfg, {
        email: msg.email,
        password: msg.password,
      });
      if (token) await authTokenItem.setValue(token);
      if (userId)
        await userItem.setValue({ id: userId, email: msg.email, name: null });
      scheduleSync();
      return { kind: "state", state: await getPopupState() };
    }

    case "signUp": {
      const cfg = await buildClientConfig();
      const { token, userId } = await signUpEmail(cfg, {
        email: msg.email,
        password: msg.password,
        name: msg.name,
      });
      if (token) await authTokenItem.setValue(token);
      if (userId)
        await userItem.setValue({ id: userId, email: msg.email, name: msg.name });
      scheduleSync();
      return { kind: "state", state: await getPopupState() };
    }

    case "signOut": {
      const cfg = await buildClientConfig();
      try {
        await signOutCall(cfg);
      } catch {
        // best-effort: server may already have ended the session.
      }
      await authTokenItem.setValue(null);
      await userItem.setValue(null);
      return { kind: "state", state: await getPopupState() };
    }

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
  }
}

export default defineBackground(() => {
  console.log("[ao3-tracker] background worker started", { id: browser.runtime.id });

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

  // Background sync every 5 minutes when signed in.
  void browser.alarms.create("ao3-tracker-periodic-sync", { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "ao3-tracker-periodic-sync") void triggerSync();
  });

  void triggerSync();
});
