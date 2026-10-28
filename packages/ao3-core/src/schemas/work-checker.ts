import { z } from "zod";

/**
 * Wire contract between the API Worker and the self-hosted browser work checker. The checker
 * initiates every request; the Worker never contacts it.
 */

export const workCheckerSettingsSchema = z.object({
  enabled: z.boolean(),
  pollIntervalSeconds: z.number().int().min(30).max(86_400),
  maxWorksPerPoll: z.number().int().min(1).max(100),
  delayBetweenRequestsMs: z.number().int().min(0).max(600_000),
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

const count = z.number().int().nonnegative();

export const workCheckerOutcomeCountsSchema = z.object({
  page: count,
  not_found: count,
  restricted: count,
  unavailable: count,
  failed: count,
});

/** What one poll did; `enabled: false` polls read the settings and claimed nothing */
export const workCheckerPollSummarySchema = z.object({
  at: z.iso.datetime(),
  durationMs: count,
  enabled: z.boolean(),
  claimed: count,
  outcomes: workCheckerOutcomeCountsSchema,
  backupsUploaded: count,
  backupsFailed: count,
  /** The poll ended early because AO3 was unavailable */
  stoppedEarly: z.boolean(),
});

/** Sent by the checker at startup and after every poll, and shown on the admin dashboard */
export const workCheckerStatusSchema = z.object({
  checkerId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  /** The image's source commit */
  version: z.string().min(1).max(64),
  startedAt: z.iso.datetime(),
  lastPoll: workCheckerPollSummarySchema.nullable(),
  /** The most recent poll failure (an unreachable Worker or an unexpected error) */
  lastError: z.object({ at: z.iso.datetime(), message: z.string().max(1000) }).nullable(),
});

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
export type WorkCheckerOutcomeCounts = z.infer<typeof workCheckerOutcomeCountsSchema>;
export type WorkCheckerPollSummary = z.infer<typeof workCheckerPollSummarySchema>;
export type WorkCheckerStatus = z.infer<typeof workCheckerStatusSchema>;
export type WorkCheckerBackupOutcome = z.infer<
  typeof workCheckerBackupUploadResponseSchema
>["outcome"];
