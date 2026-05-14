import { z } from "zod";

/**
 * WebViewMessage protocol shared between the native KMP WebView injection and
 * the browser extension content script. The native side parses these as JSON
 * over a `postMessage` bridge; the extension side ships them over
 * `chrome.runtime.sendMessage`. The shapes are identical.
 */

export const tagInfoSchema = z.object({
  tag: z.string().nullable(),
  href: z.string().nullable(),
});
export type TagInfo = z.infer<typeof tagInfoSchema>;

export const workInfoMessageSchema = z.object({
  type: z.literal("workInfo"),
  url: z.string(),
  workName: z.string().nullable(),
  workLastUpdated: z.string().nullable(),
  chapterId: z.string().nullable(),
  chapterName: z.string().nullable(),
  chapterNumber: z.string().nullable(),
  totalChapters: z.string().nullable(),
  authorUrl: z.string().nullable(),
  authorName: z.string().nullable(),
  summary: z.string().nullable(),
  wordCount: z.string().nullable(),
  language: z.string().nullable(),
  kudos: z.string().nullable(),
  hits: z.string().nullable(),
  bookmarks: z.string().nullable(),
  comments: z.string().nullable(),
  downloadPath: z.string().nullable(),
  downloadUpdatedAt: z.string().nullable(),
  isPrivate: z.boolean(),
});
export type WorkInfoMessage = z.infer<typeof workInfoMessageSchema>;

export const workTagsMessageSchema = z.object({
  type: z.literal("workTags"),
  url: z.string(),
  workLastUpdated: z.string().nullable(),
  rating: tagInfoSchema.optional(),
  warning: z.array(tagInfoSchema),
  category: z.array(tagInfoSchema),
  fandom: z.array(tagInfoSchema),
  relationship: z.array(tagInfoSchema),
  character: z.array(tagInfoSchema),
  freeform: z.array(tagInfoSchema),
});
export type WorkTagsMessage = z.infer<typeof workTagsMessageSchema>;

export const chapterInfoSchema = z.object({
  chapterDate: z.string().nullable(),
  chapterNumber: z.string().nullable(),
  chapterUrl: z.string().nullable(),
});
export type ChapterInfo = z.infer<typeof chapterInfoSchema>;

export const workChapterIndexMessageSchema = z.object({
  type: z.literal("workChapterIndex"),
  url: z.string(),
  authorUrl: z.string().nullable(),
  chapters: z.array(chapterInfoSchema),
});
export type WorkChapterIndexMessage = z.infer<typeof workChapterIndexMessageSchema>;

export const scrollProgressMessageSchema = z.object({
  type: z.literal("scrollProgress"),
  url: z.string(),
  scrollPercentage: z.number(),
});
export type ScrollProgressMessage = z.infer<typeof scrollProgressMessageSchema>;

export const listWorksMessageSchema = z.object({
  type: z.literal("listWorks"),
  url: z.string(),
  workIds: z.array(z.number().int()),
});
export type ListWorksMessage = z.infer<typeof listWorksMessageSchema>;

export const webViewMessageSchema = z.discriminatedUnion("type", [
  workInfoMessageSchema,
  workTagsMessageSchema,
  workChapterIndexMessageSchema,
  scrollProgressMessageSchema,
  listWorksMessageSchema,
]);
export type WebViewMessage = z.infer<typeof webViewMessageSchema>;
