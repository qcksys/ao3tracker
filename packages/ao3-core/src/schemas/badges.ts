import { z } from "zod";
import type { WorkBadgeData, WorkBadgeStatus } from "../badges";

export const workBadgeStatusSchema: z.ZodType<WorkBadgeStatus> = z.enum([
  "not-started",
  "in-progress",
  "caught-up",
  "finished",
  "has-new-chapters",
  "private",
]);

export const workBadgeDataSchema: z.ZodType<WorkBadgeData> = z.object({
  id: z.number().int().positive(),
  status: workBadgeStatusSchema,
  progressPercent: z.number().min(0).max(100),
  favourite: z.boolean(),
});
