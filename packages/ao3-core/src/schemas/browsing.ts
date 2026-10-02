import { z } from "zod";
import languages from "../languages.json";

const languageCodes = new Set(languages.map(({ code }) => code));

export const browsingPreferencesSchema = z.object({
  hiddenWorkIds: z.array(z.number().int().positive()),
  hiddenWorkTitles: z.record(z.string(), z.string()).default({}),
  hideCaughtUp: z.boolean().default(false),
  hiddenTags: z.array(z.string().trim().min(1)),
  languageFilterEnabled: z.boolean().default(false),
  maxFandoms: z.number().int().positive().max(2147483647).nullable().default(null),
  searchLanguage: z
    .string()
    .refine((code) => languageCodes.has(code), "Unknown AO3 language")
    .default("en"),
});
export type BrowsingPreferences = z.infer<typeof browsingPreferencesSchema>;

export const browsingStateSchema = browsingPreferencesSchema.extend({
  savedSearchUrls: z.array(z.string()),
});
export type BrowsingState = z.infer<typeof browsingStateSchema>;

export const setWorkHiddenSchema = z.object({
  workId: z.number().int().positive(),
  hidden: z.boolean(),
  title: z.string().optional(),
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
