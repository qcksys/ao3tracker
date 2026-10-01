import { describe, expect, it } from "vite-plus/test";
import {
  allowsNotification,
  defaultNotificationPreferences,
  notificationPreferencesSchema,
  notificationTypeSchema,
} from "../src/schemas/notifications";

describe("notification preferences", () => {
  it("defaults missing fields to enabled and rejects non-boolean values", () => {
    expect(notificationPreferencesSchema.parse({ enabled: false })).toEqual({
      ...defaultNotificationPreferences,
      enabled: false,
    });
    expect(notificationPreferencesSchema.safeParse({ new_chapters: "false" }).success).toBe(false);
  });

  it.each(notificationTypeSchema.options)(
    "independently filters %s and honors the master switch",
    (type) => {
      expect(allowsNotification(defaultNotificationPreferences, type)).toBe(true);
      const muted = { ...defaultNotificationPreferences, [type]: false };
      for (const other of notificationTypeSchema.options) {
        expect(allowsNotification(muted, other)).toBe(other !== type);
        expect(
          allowsNotification({ ...defaultNotificationPreferences, enabled: false }, other),
        ).toBe(false);
      }
    },
  );
});
