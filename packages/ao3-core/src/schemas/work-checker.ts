import { z } from "zod";

/**
 * Wire contract between the API Worker and the self-hosted browser work checker. The checker
 * initiates every request; the Worker never contacts it.
 */

export const workCheckerSettingsSchema = z.object({
  enabled: z.boolean(),
  pollIntervalSeconds: z.number().int().positive(),
  maxWorksPerPoll: z.number().int().positive(),
  delayBetweenRequestsMs: z.number().int().nonnegative(),
});

export const workCheckerJobSchema = z.object({
  workId: z.number().int().positive(),
  /** `refresh` re-checks a stored work; `missing` fetches a tracked work not stored yet */
  kind: z.enum(["refresh", "missing"]),
});

export const workCheckerClaimResponseSchema = z.object({
  jobs: z.array(workCheckerJobSchema),
});

const workId = z.number().int().positive();

export const workCheckerResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("page"),
    workId,
    workHtml: z.string(),
    /** Sent only after the Worker answers `needs_chapter_index` */
    chapterIndexHtml: z.string().optional(),
  }),
  z.object({ outcome: z.literal("not_found"), workId }),
  z.object({ outcome: z.literal("restricted"), workId }),
  /** AO3 is failing or limiting requests (429, 5xx, timeout, unsolved challenge) */
  z.object({ outcome: z.literal("unavailable"), workId, error: z.string() }),
  /** Any other failure specific to this work */
  z.object({ outcome: z.literal("failed"), workId, error: z.string() }),
]);

export const workCheckerBackupFormatSchema = z.enum(["epub", "html"]);

export const workCheckerBackupRequestSchema = z.object({
  format: workCheckerBackupFormatSchema,
  url: z.url(),
  /** Unix seconds; echoed back on upload so the Worker rejects backups of a superseded revision */
  downloadUpdatedAt: z.number().int().nonnegative(),
});

export const workCheckerResultResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("applied"), backups: z.array(workCheckerBackupRequestSchema) }),
  /** The chapter count increased: load the chapter index and post the result again with it */
  z.object({ status: z.literal("needs_chapter_index") }),
]);

export const workCheckerBackupUploadResponseSchema = z.object({
  /** `superseded` (HTTP 409): AO3 has a newer download revision than the uploaded one */
  outcome: z.enum(["stored", "current", "superseded"]),
});

export type WorkCheckerSettings = z.infer<typeof workCheckerSettingsSchema>;
export type WorkCheckerJob = z.infer<typeof workCheckerJobSchema>;
export type WorkCheckerResult = z.infer<typeof workCheckerResultSchema>;
export type WorkCheckerBackupFormat = z.infer<typeof workCheckerBackupFormatSchema>;
export type WorkCheckerBackupRequest = z.infer<typeof workCheckerBackupRequestSchema>;
export type WorkCheckerResultResponse = z.infer<typeof workCheckerResultResponseSchema>;
export type WorkCheckerBackupOutcome = z.infer<
  typeof workCheckerBackupUploadResponseSchema
>["outcome"];
