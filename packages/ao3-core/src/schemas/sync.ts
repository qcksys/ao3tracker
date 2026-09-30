import { z } from "zod";
import { tagTypeIdSchema, tagTypeNameSchema } from "./tags";

/**
 * Wire schemas for the /api/track/sync endpoint. Kept in sync with
 * apps/api/src/routes/api.track.ts — when the server contract changes, update
 * both. The api file is the source of truth; this file is its mirror so
 * non-api consumers (browser extension, future native ports) can validate
 * responses and build request bodies without depending on the worker package.
 */

const isoDatetime = z.iso.datetime();

export const syncWorkRowSchema = z.object({
  workId: z.number().int().positive(),
  lastReadAt: isoDatetime,
  markedCompleteAt: isoDatetime.nullable(),
  private: z.boolean(),
  subscribed: z.boolean(),
  favourite: z.boolean(),
  subscribedUpdatedAt: isoDatetime.nullable(),
  favouriteUpdatedAt: isoDatetime.nullable(),
  deleted: z.boolean(),
});
export type SyncWorkRow = z.infer<typeof syncWorkRowSchema>;

export const syncChapterRowSchema = z.object({
  workId: z.number().int().positive(),
  chapterId: z.number().int().nonnegative(),
  lastReadAt: isoDatetime,
  markedCompleteAt: isoDatetime.nullable(),
  readProgress: z.number().min(0).max(1),
  deleted: z.boolean(),
});
export type SyncChapterRow = z.infer<typeof syncChapterRowSchema>;

export const syncWorkMetadataSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  author: z.string().nullable(),
  authorUrl: z.string().nullable(),
  summary: z.string().nullable(),
  language: z.string().nullable(),
  wordCount: z.number().nullable(),
  currentChapters: z.number().nullable(),
  totalChapters: z.number().nullable(),
  hits: z.number().nullable(),
  kudos: z.number().nullable(),
  bookmarks: z.number().nullable(),
  comments: z.number().nullable(),
  downloadPath: z.string().nullable(),
  published: isoDatetime,
  lastUpdated: isoDatetime,
  downloadUpdatedAt: isoDatetime.nullable(),
});
export type SyncWorkMetadata = z.infer<typeof syncWorkMetadataSchema>;

export const syncChapterMetadataSchema = z.object({
  id: z.number().int().nonnegative(),
  workId: z.number().int().positive(),
  number: z.number().nullable(),
  title: z.string().nullable(),
  dateUpdated: isoDatetime.nullable(),
});
export type SyncChapterMetadata = z.infer<typeof syncChapterMetadataSchema>;

export const syncTagMetadataSchema = z.object({
  workId: z.number().int().positive(),
  tag: z.string(),
  href: z.string().nullable(),
  type: tagTypeNameSchema,
});
export type SyncTagMetadata = z.infer<typeof syncTagMetadataSchema>;

export const favouriteTagItemSchema = z.object({
  tagType: tagTypeIdSchema,
  tag: z.string().min(1).max(191),
  favourited: z.boolean(),
  updatedAt: isoDatetime,
});
export type FavouriteTagItem = z.infer<typeof favouriteTagItemSchema>;

// Mirror of apps/api/src/routes/api.track.ts savedSearchItemSchema — keep in
// lockstep (id is a client-generated uuid; url cap matches the DB column).
export const savedSearchItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(191),
  url: z.string().min(1).max(8192),
  updatedAt: isoDatetime,
  deleted: z.boolean(),
});
export type SavedSearchItem = z.infer<typeof savedSearchItemSchema>;

export const syncFilterSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workIds"),
    workIds: z.array(z.number().int().positive()).min(1).max(50),
  }),
]);
export type SyncFilter = z.infer<typeof syncFilterSchema>;

export const getSyncResponseSchema = z.object({
  works: z.array(syncWorkRowSchema),
  chapters: z.array(syncChapterRowSchema),
  workMetadata: z.array(syncWorkMetadataSchema),
  chapterMetadata: z.array(syncChapterMetadataSchema),
  tagMetadata: z.array(syncTagMetadataSchema),
  nextWorkCursor: z.number().nullable(),
  hasMore: z.boolean(),
  serverLastUpdated: isoDatetime,
  latestWorkLastReadAt: isoDatetime.nullable(),
  favouriteTags: z.array(favouriteTagItemSchema).optional(),
  savedSearches: z.array(savedSearchItemSchema).optional(),
});
export type GetSyncResponse = z.infer<typeof getSyncResponseSchema>;

export const postSyncRequestSchema = z.object({
  works: z
    .array(
      syncWorkRowSchema.omit({ deleted: true }).extend({ deleted: z.boolean().default(false) }),
    )
    .max(50)
    .optional(),
  chapters: z
    .array(syncChapterRowSchema.extend({ deleted: z.boolean().optional().default(false) }))
    .optional(),
  favouriteTags: z.array(favouriteTagItemSchema).max(500).optional(),
  savedSearches: z.array(savedSearchItemSchema).max(500).optional(),
});
export type PostSyncRequest = z.input<typeof postSyncRequestSchema>;

const itemStatus = z.enum(["accepted", "ignored", "deleted"]);
const favouriteItemStatus = z.enum(["accepted", "ignored"]);

export const postSyncResponseSchema = z.object({
  works: z.array(z.object({ workId: z.number(), status: itemStatus })),
  chapters: z.array(z.object({ workId: z.number(), chapterId: z.number(), status: itemStatus })),
  favouriteTags: z
    .array(
      z.object({
        tagType: tagTypeIdSchema,
        tag: z.string(),
        status: favouriteItemStatus,
      }),
    )
    .optional(),
  savedSearches: z.array(z.object({ id: z.uuid(), status: favouriteItemStatus })).optional(),
  syncedAt: isoDatetime,
});
export type PostSyncResponse = z.infer<typeof postSyncResponseSchema>;
