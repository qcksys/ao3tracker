import {
  type FavouriteTagItem,
  tagTypeIdSchema,
  type WebViewMessage,
  type WorkBadgeData,
  webViewMessageSchema,
} from "@qcksys/ao3tracker-core";
import { z } from "zod";

/**
 * Messages flowing **content script → background**. These wrap the canonical
 * `WebViewMessage` (shared with the native KMP app) so the receiver can
 * branch on `message.kind` before dispatching to per-type handlers.
 */
export const contentToBackgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pageEvent"), payload: webViewMessageSchema }),
  z.object({ kind: z.literal("requestBadges"), workIds: z.array(z.number().int().positive()) }),
]);
export type ContentToBackground = z.infer<typeof contentToBackgroundSchema>;

/** background → content responses (synchronous, sent as the sendResponse). */
export const backgroundToContentResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("badges"), entries: z.array(z.custom<WorkBadgeData>()) }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type BackgroundToContentResponse = z.infer<typeof backgroundToContentResponseSchema>;

/** Messages flowing **popup → background**. */
export const popupToBackgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("getState") }),
  z.object({ kind: z.literal("signIn"), email: z.string().email(), password: z.string().min(1) }),
  z.object({ kind: z.literal("signUp"), email: z.string().email(), password: z.string().min(1), name: z.string().min(1) }),
  z.object({ kind: z.literal("signOut") }),
  z.object({ kind: z.literal("syncNow") }),
  z.object({ kind: z.literal("toggleFavouriteTag"), tagType: tagTypeIdSchema, tag: z.string().min(1), favourited: z.boolean() }),
  z.object({ kind: z.literal("setApiBaseUrl"), baseUrl: z.string().url() }),
]);
export type PopupToBackground = z.infer<typeof popupToBackgroundSchema>;

/** Background → popup state snapshot. */
export const popupStateSchema = z.object({
  apiBaseUrl: z.string(),
  authenticated: z.boolean(),
  user: z
    .object({ id: z.string(), email: z.string().nullable(), name: z.string().nullable() })
    .nullable(),
  lastSyncedAt: z.string().nullable(),
  lastSyncError: z.string().nullable(),
  syncing: z.boolean(),
  trackedCount: z.number().int().nonnegative(),
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
  favouriteTags: z.array(
    z.custom<FavouriteTagItem>(),
  ),
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
