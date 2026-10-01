import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "new_chapters",
  "work_completed",
  "work_restricted",
  "work_deleted",
]);

export const notificationPreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  new_chapters: z.boolean().default(true),
  work_completed: z.boolean().default(true),
  work_restricted: z.boolean().default(true),
  work_deleted: z.boolean().default(true),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const defaultNotificationPreferences = notificationPreferencesSchema.parse({});

export function allowsNotification(
  preferences: NotificationPreferences,
  type: string | undefined,
): boolean {
  const parsed = notificationTypeSchema.safeParse(type);
  return preferences.enabled && (!parsed.success || preferences[parsed.data]);
}
