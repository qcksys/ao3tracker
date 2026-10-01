import { z } from "zod";
import { extensionBranding } from "./branding";

import {
  authTokenItem,
  lastSeenNotificationIdItem,
  notificationWorkIdsItem,
  notificationsEnabledItem,
} from "./storage";
import { accountContextItem, isCurrentSession, type SyncSession } from "./account-state";
import { withLocalState } from "./local-state";

const notificationItemSchema = z.object({
  id: z.number(),
  workId: z.number(),
  type: z.enum(["new_chapters", "work_completed", "work_restricted", "work_deleted"]),
  title: z.string(),
  body: z.string(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

const notificationHistoryResponseSchema = z.object({
  notifications: z.array(notificationItemSchema),
  nextCursor: z.number().nullable(),
  hasMore: z.boolean(),
});

/**
 * Fetch notification history from the api. Cursor-based pagination — we walk
 * forward until we hit a notification id we've already shown.
 */
async function fetchNotifications(
  baseUrl: string,
  bearerToken: string,
  cursor?: number,
): Promise<{
  notifications: NotificationItem[];
  nextCursor: number | null;
  hasMore: boolean;
}> {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/push/notifications`);
  if (cursor !== undefined) url.searchParams.set("cursor", String(cursor));
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch notifications: ${res.status}`);
  }
  const json = await res.json();
  return notificationHistoryResponseSchema.parse(json);
}

const ICON_URL = `/${extensionBranding(import.meta.env.MODE).icons[128]}` as const;

/**
 * Build a chrome.notifications id from a server notification id so duplicate
 * polls don't double-fire OS notifications.
 */
function chromeNotificationId(notification: NotificationItem): string {
  return `ao3-${notification.id}`;
}

function workUrl(notification: NotificationItem): string {
  return `https://archiveofourown.org/works/${notification.workId}`;
}

/**
 * Create a chrome notification for each item. Records the (chromeId → workId)
 * mapping so the click handler can open the right tab without re-fetching.
 */
async function showSystemNotifications(items: NotificationItem[]): Promise<void> {
  const workIdMap = await notificationWorkIdsItem.getValue();
  for (const n of items) {
    const cid = chromeNotificationId(n);
    try {
      await browser.notifications.create(cid, {
        type: "basic",
        // WXT serves icons under /icon/<size>.png.
        iconUrl: browser.runtime.getURL(ICON_URL),
        title: n.title,
        message: n.body,
        priority: 1,
      });
      workIdMap[cid] = n.workId;
    } catch (err) {
      console.warn("[ao3-tracker] notification create failed", err);
    }
  }
  await notificationWorkIdsItem.setValue(workIdMap);
}

/**
 * Poll the api for new notifications and show any we haven't shown before.
 * Tracks the highest-seen id locally so we never re-show the same notification
 * even across reloads of the service worker.
 */
export async function pollAndDisplayNotifications(): Promise<void> {
  const snapshot = await withLocalState(async () => {
    const context = await accountContextItem.getValue();
    const token = await authTokenItem.getValue();
    if (!context?.userId || !token || !(await notificationsEnabledItem.getValue())) return null;
    return {
      session: { ...context, token },
      lastSeenId: await lastSeenNotificationIdItem.getValue(),
    };
  });
  if (!snapshot) return;
  const { session, lastSeenId } = snapshot;

  // Walk forward (newer notifications first); stop once we hit one we've
  // already seen, or once the api says hasMore=false.
  const newItems: NotificationItem[] = [];
  let cursor: number | undefined;
  const cap = 200; // hard cap so a long-stale client doesn't notification-flood
  while (newItems.length < cap) {
    const page = await fetchNotifications(session.baseUrl, session.token, cursor);
    if (!(await isCurrentSession(session))) return;
    for (const n of page.notifications) {
      if (lastSeenId !== null && n.id <= lastSeenId) {
        // From here on, everything is older — we're done.
        return await finalize(newItems, session);
      }
      newItems.push(n);
    }
    if (!page.hasMore || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  await finalize(newItems, session);
}

async function finalize(newItems: NotificationItem[], session: SyncSession): Promise<void> {
  if (newItems.length === 0) return;
  // Show oldest-first so the user perceives chronological order.
  const sorted = [...newItems].sort((a, b) => a.id - b.id);
  await withLocalState(async () => {
    if (!(await isCurrentSession(session)) || !(await notificationsEnabledItem.getValue())) return;
    const seen = await lastSeenNotificationIdItem.getValue();
    const unseen = sorted.filter((item) => seen === null || item.id > seen);
    const latest = unseen.at(-1);
    if (!latest) return;
    await showSystemNotifications(unseen);
    await lastSeenNotificationIdItem.setValue(latest.id);
  });
}

/**
 * Open the matching AO3 work tab when the user clicks a chrome notification.
 * Idempotent — calling more than once installs only one listener per worker.
 */
let clickHandlerInstalled = false;
export function attachNotificationClickHandler(): void {
  if (clickHandlerInstalled) return;
  clickHandlerInstalled = true;
  browser.notifications.onClicked.addListener(async (notificationId) => {
    await withLocalState(async () => {
      const map = await notificationWorkIdsItem.getValue();
      const workId = map[notificationId];
      void browser.notifications.clear(notificationId);
      if (workId) {
        await browser.tabs.create({ url: `https://archiveofourown.org/works/${workId}` });
        delete map[notificationId];
        await notificationWorkIdsItem.setValue(map);
      }
    });
  });
}

export { workUrl };
