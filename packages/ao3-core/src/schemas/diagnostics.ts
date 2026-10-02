import { z } from "zod";

export const webViewDiagnosticSchema = z.discriminatedUnion("event", [
  z.strictObject({ event: z.literal("webview_ready") }),
  z.strictObject({
    event: z.literal("webview_error"),
    kind: z.enum(["script", "promise"]),
  }),
  z.strictObject({
    event: z.literal("webview_action"),
    action: z.enum(["save_search", "hide_work", "show_work"]),
  }),
]);

export const diagnosticEventSchema = z.union([
  webViewDiagnosticSchema,
  z.strictObject({ event: z.literal("app_opened") }),
  z.strictObject({
    event: z.literal("screen_viewed"),
    screen: z.enum(["read", "works", "searches", "settings"]),
  }),
  z.strictObject({
    event: z.literal("sync_finished"),
    outcome: z.enum(["success", "error", "unauthenticated"]),
  }),
  z.strictObject({
    event: z.literal("diagnostic_log"),
    level: z.enum(["warning", "error"]),
    component: z.enum(["auth", "sync", "reader", "push", "storage", "app"]),
  }),
]);

export const diagnosticRequestSchema = z.strictObject({
  sessionId: z.uuid(),
  platform: z.enum(["android", "ios", "desktop"]),
  data: diagnosticEventSchema,
});

export type WebViewDiagnostic = z.infer<typeof webViewDiagnosticSchema>;
export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>;
