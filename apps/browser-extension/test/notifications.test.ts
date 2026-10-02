import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { defaultNotificationPreferences } from "@qcksys/ao3tracker-core/notifications";

const persisted = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    defineItem: (key: string, options: { fallback: unknown }) => ({
      getValue: async () =>
        structuredClone(persisted.has(key) ? persisted.get(key) : options.fallback),
      setValue: async (value: unknown) => {
        persisted.set(key, structuredClone(value));
      },
    }),
  },
}));

import { accountContextItem } from "../lib/account-state";
import { attachNotificationClickHandler, pollAndDisplayNotifications } from "../lib/notifications";
import {
  authTokenItem,
  getNotificationPreferences,
  lastSeenNotificationIdItem,
  notificationPreferencesItem,
  notificationsEnabledItem,
  notificationWorkIdsItem,
  trackedChaptersItem,
  chapterMetadataItem,
} from "../lib/storage";
import { popupToBackgroundSchema } from "../lib/messaging";

const create = vi.fn();
const item = (id: number, type = "new_chapters") => ({
  id,
  type,
  workId: 123,
  title: "Update",
  body: "Work updated",
  sentAt: null,
  createdAt: "2026-10-01T00:00:00Z",
});
const page = (notifications: ReturnType<typeof item>[]) =>
  Response.json({ notifications, nextCursor: null, hasMore: false });

beforeEach(async () => {
  persisted.clear();
  create.mockReset();
  vi.stubGlobal("browser", {
    notifications: { create },
    runtime: { getURL: (url: string) => url },
  });
  await accountContextItem.setValue({
    owner: "alice",
    userId: "alice",
    baseUrl: "https://ao3tracker.com",
    generation: "1",
  });
  await authTokenItem.setValue("token");
});
afterEach(() => vi.unstubAllGlobals());

describe("device notification preferences", () => {
  it("notification clicks use current completion to open the next chapter", async () => {
    const listeners: ((id: string) => Promise<void>)[] = [];
    const openTab = vi.fn();
    vi.stubGlobal("browser", {
      notifications: {
        clear: vi.fn(),
        onClicked: {
          addListener: (listener: (id: string) => Promise<void>) => listeners.push(listener),
        },
      },
      tabs: { create: openTab },
    });
    attachNotificationClickHandler();
    await notificationWorkIdsItem.setValue({ "ao3-1": 123 });
    await trackedChaptersItem.setValue({
      "123:91": {
        workId: 123,
        chapterId: 91,
        readProgress: 0.95,
        markedCompleteAt: null,
        lastReadAt: "2026-10-02T00:00:00Z",
        pendingSync: false,
      },
    });
    await chapterMetadataItem.setValue({
      123: [
        { id: 91, workId: 123, number: 1, title: null, dateUpdated: null },
        { id: 42, workId: 123, number: 2, title: null, dateUpdated: null },
      ],
    });
    const before = await trackedChaptersItem.getValue();
    await listeners[0]!("ao3-1");
    expect(openTab).toHaveBeenCalledWith({
      url: "https://archiveofourown.org/works/123/chapters/42?scrollTo=0#chapters",
    });
    expect(await trackedChaptersItem.getValue()).toEqual(before);
    expect(await notificationWorkIdsItem.getValue()).toEqual({});
  });

  it("preserves a disabled legacy toggle when adding category defaults", async () => {
    await notificationsEnabledItem.setValue(false);
    expect(await getNotificationPreferences()).toEqual({
      ...defaultNotificationPreferences,
      enabled: false,
    });
  });

  it("validates setting names and boolean changes", () => {
    expect(
      popupToBackgroundSchema.safeParse({
        kind: "setNotificationPreference",
        key: "work_deleted",
        enabled: false,
      }).success,
    ).toBe(true);
    expect(
      popupToBackgroundSchema.safeParse({
        kind: "setNotificationPreference",
        key: "anything",
        enabled: false,
      }).success,
    ).toBe(false);
    expect(
      popupToBackgroundSchema.safeParse({
        kind: "setNotificationPreference",
        key: "enabled",
        enabled: "false",
      }).success,
    ).toBe(false);
  });

  it("discards muted categories while showing enabled ones without replaying them", async () => {
    await notificationPreferencesItem.setValue({
      ...defaultNotificationPreferences,
      new_chapters: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => page([item(2), item(1, "work_completed")])),
    );
    await pollAndDisplayNotifications();
    expect(create.mock.calls.map(([id]) => id)).toEqual(["ao3-1"]);
    expect(await lastSeenNotificationIdItem.getValue()).toBe(2);
    await notificationPreferencesItem.setValue(defaultNotificationPreferences);
    await pollAndDisplayNotifications();
    expect(create).toHaveBeenCalledOnce();
  });

  it("consumes notifications while all alerts are off", async () => {
    await notificationPreferencesItem.setValue({
      ...defaultNotificationPreferences,
      enabled: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page([item(3)])));
    await pollAndDisplayNotifications();
    expect(create).not.toHaveBeenCalled();
    expect(await lastSeenNotificationIdItem.getValue()).toBe(3);
  });

  it("uses updated settings when a poll is already in flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await notificationPreferencesItem.setValue({
          ...defaultNotificationPreferences,
          enabled: false,
        });
        return page([item(4)]);
      }),
    );
    await pollAndDisplayNotifications();
    expect(create).not.toHaveBeenCalled();
    expect(await lastSeenNotificationIdItem.getValue()).toBe(4);
  });

  it("discards results after the account changes without advancing the other account's cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await accountContextItem.setValue({
          owner: "bob",
          userId: "bob",
          baseUrl: "https://ao3tracker.com",
          generation: "2",
        });
        return page([item(5)]);
      }),
    );
    await pollAndDisplayNotifications();
    expect(create).not.toHaveBeenCalled();
    expect(await lastSeenNotificationIdItem.getValue()).toBeNull();
  });
});
