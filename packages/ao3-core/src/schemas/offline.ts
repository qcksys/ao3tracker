import { z } from "zod";

const ao3Identity = z.union([
  z.literal("guest"),
  z
    .string()
    .regex(/^user:.+/)
    .min(6)
    .max(196),
]);

export const offlineObservationSchema = z.object({
  url: z.string().url().max(8192),
  identity: ao3Identity.nullable(),
  readable: z.boolean(),
});
export type OfflineObservation = z.infer<typeof offlineObservationSchema>;

const id = z.string().regex(/^\d+$/);

export const offlineStyleSchema = z.object({
  css: z.string(),
  sourceUrl: z.string(),
  media: z.string(),
  disabled: z.boolean(),
});

export const offlineChapterSchema = z.object({
  id,
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
});

export const offlinePageSchema = z.object({
  version: z.literal(1),
  url: z.string(),
  workId: id,
  chapterId: id,
  representation: z.enum(["chapter", "whole"]),
  title: z.string(),
  ao3Identity,
  canSelectSkin: z.boolean(),
  html: z.string(),
  siteStyles: z.array(offlineStyleSchema),
  chapters: z.array(offlineChapterSchema),
  downloadUpdatedAt: z.string().datetime().nullable().optional(),
});

export type OfflineStyle = z.infer<typeof offlineStyleSchema>;
export type OfflineChapter = z.infer<typeof offlineChapterSchema>;
export type OfflinePage = z.infer<typeof offlinePageSchema>;

export const offlineResourceSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
});

export const offlineResourceDataSchema = offlineResourceSchema.extend({ base64: z.string() });

export const offlineBundleSchema = z.object({
  page: offlinePageSchema,
  skinHash: z.string().regex(/^[a-f0-9]{64}$/),
  resources: z.array(offlineResourceSchema),
  missingResources: z.array(z.string()),
});

export type OfflineResource = z.infer<typeof offlineResourceSchema>;
export type OfflineResourceData = z.infer<typeof offlineResourceDataSchema>;
export type OfflineBundle = z.infer<typeof offlineBundleSchema>;

export const offlineTransferSchema = z.object({
  type: z.literal("offlineTransfer"),
  token: z.string().min(1),
  transferId: z.string().min(1),
  kind: z.enum(["resource", "bundle"]),
  index: z.number().int().nonnegative(),
  total: z.number().int().min(1).max(2048),
  text: z.string().max(16_384),
});

export const offlineFetchSchema = z.object({
  type: z.literal("offlineFetch"),
  token: z.string().min(1),
  id: z.string().min(1),
  url: z.string(),
});

export const offlineFailureSchema = z.object({
  type: z.literal("offlineFailure"),
  token: z.string().min(1),
  message: z.string().max(256),
});

export const offlineCaptureMessageSchema = z.discriminatedUnion("type", [
  offlineTransferSchema,
  offlineFetchSchema,
  offlineFailureSchema,
]);
export type OfflineCaptureMessage = z.infer<typeof offlineCaptureMessageSchema>;

export const offlineReaderOptionsSchema = z.object({
  token: z.string().min(1),
  canonicalUrl: z.string(),
  workId: id,
  chapterId: id,
  scrollPercentage: z.number().min(0).max(100),
  fragment: z.string(),
});
export type OfflineReaderOptions = z.infer<typeof offlineReaderOptionsSchema>;

export const offlineReaderMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("offlineReady"), token: z.string().min(1) }),
  z.object({ type: z.literal("offlineNavigate"), token: z.string().min(1), url: z.string() }),
  z.object({
    type: z.literal("offlineProgress"),
    token: z.string().min(1),
    scrollPercentage: z.number().int().min(0).max(100),
  }),
]);
export type OfflineReaderMessage = z.infer<typeof offlineReaderMessageSchema>;
