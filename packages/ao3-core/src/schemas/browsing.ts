import { z } from "zod";

export const browsingPreferencesSchema = z.object({
  hiddenWorkIds: z.array(z.number().int().positive()),
  hiddenTags: z.array(z.string().trim().min(1)),
});
export type BrowsingPreferences = z.infer<typeof browsingPreferencesSchema>;

export const browsingStateSchema = browsingPreferencesSchema.extend({
  savedSearchUrls: z.array(z.string()),
});
export type BrowsingState = z.infer<typeof browsingStateSchema>;

export const setWorkHiddenSchema = z.object({
  workId: z.number().int().positive(),
  hidden: z.boolean(),
});

export const browsingReadyMessageSchema = z.object({
  type: z.literal("browsingReady"),
  url: z.string().url(),
});
export type BrowsingReadyMessage = z.infer<typeof browsingReadyMessageSchema>;

export const setWorkHiddenMessageSchema = setWorkHiddenSchema.extend({
  type: z.literal("setWorkHidden"),
  url: z.string().url(),
});
export type SetWorkHiddenMessage = z.infer<typeof setWorkHiddenMessageSchema>;
