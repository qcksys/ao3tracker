import {
  type FavouriteTagItem,
  type SavedSearchItem,
  tagTypeIdSchema,
  type WebViewMessage,
  type WorkBadgeData,
  webViewMessageSchema,
} from "@qcksys/ao3tracker-core";
import { z } from "zod";
import {
  browsingPreferencesSchema,
  browsingStateSchema,
  notificationPreferencesSchema,
  setWorkHiddenSchema,
} from "@qcksys/ao3tracker-core/schemas";

/**
 * Messages flowing **content script → background**. These wrap the canonical
 * `WebViewMessage` (shared with the native KMP app) so the receiver can
 * branch on `message.kind` before dispatching to per-type handlers.
 */
export const contentToBackgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("getBrowsingState") }),
  setWorkHiddenSchema.extend({ kind: z.literal("setWorkHidden") }),
  z.object({ kind: z.literal("pageEvent"), payload: webViewMessageSchema }),
  z.object({ kind: z.literal("requestBadges"), workIds: z.array(z.number().int().positive()) }),
  z.object({
    kind: z.literal("saveSearch"),
    name: z.string().min(1).max(191),
    url: z.string().url().max(8192),
  }),
]);
export type ContentToBackground = z.infer<typeof contentToBackgroundSchema>;

/** background → content responses (synchronous, sent as the sendResponse). */
export const backgroundToContentResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("browsingState"), state: browsingStateSchema }),
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("badges"), entries: z.array(z.custom<WorkBadgeData>()) }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type BackgroundToContentResponse = z.infer<typeof backgroundToContentResponseSchema>;

/**
 * Messages flowing **popup → background**. Auth (sign-in / sign-up / sign-out)
 * lives entirely in the popup via the Better Auth React client; the background
 * picks up token changes via `authTokenItem.watch` and triggers sync.
 */
export const popupToBackgroundSchema = z.discriminatedUnion("kind", [
  setWorkHiddenSchema.pick({ workId: true }).extend({ kind: z.literal("unhideWork") }),
  browsingPreferencesSchema.pick({ hiddenTags: true }).extend({ kind: z.literal("setHiddenTags") }),
  z.object({ kind: z.literal("getState") }),
  z.object({ kind: z.literal("syncNow") }),
  z.object({
    kind: z.literal("setAuthSession"),
    token: z.string().min(1).nullable(),
    baseUrl: z.string().url(),
  }),
  z.object({
    kind: z.literal("toggleFavouriteTag"),
    tagType: tagTypeIdSchema,
    tag: z.string().min(1),
    favourited: z.boolean(),
  }),
  z.object({
    kind: z.literal("renameSavedSearch"),
    id: z.string().min(1),
    name: z.string().min(1).max(191),
  }),
  z.object({ kind: z.literal("deleteSavedSearch"), id: z.string().min(1) }),
  z.object({ kind: z.literal("setApiBaseUrl"), baseUrl: z.string().url() }),
  z.object({
    kind: z.literal("setNotificationPreference"),
    key: notificationPreferencesSchema.keyof(),
    enabled: z.boolean(),
  }),
]);
export type PopupToBackground = z.infer<typeof popupToBackgroundSchema>;

/** Background → popup state snapshot. */
export const popupStateSchema = z.object({
  apiBaseUrl: z.string(),
  lastSyncedAt: z.string().nullable(),
  lastSyncError: z.string().nullable(),
  syncing: z.boolean(),
  trackedCount: z.number().int().nonnegative(),
  notificationPreferences: notificationPreferencesSchema,
  browsingPreferences: browsingPreferencesSchema,
  currentWork: z
    .object({
      workId: z.number().int().positive(),
      title: z.string().nullable(),
      author: z.string().nullable(),
      chapterId: z.number().int().nonnegative().nullable(),
      progressPercent: z.number().min(0).max(100),
      lastReadAt: z.string(),
      favourite: z.boolean(),
    })
    .nullable(),
  favouriteTags: z.array(z.custom<FavouriteTagItem>()),
  savedSearches: z.array(z.custom<SavedSearchItem>()),
});
export type PopupState = z.infer<typeof popupStateSchema>;

export const backgroundToPopupResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("state"), state: popupStateSchema }),
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type BackgroundToPopupResponse = z.infer<typeof backgroundToPopupResponseSchema>;

/**
 * Re-export the page-event helper type for callers building a runtime branch.
 */
export type PageEventMessage = Extract<ContentToBackground, { kind: "pageEvent" }>;
export type PageEventPayload = WebViewMessage;
