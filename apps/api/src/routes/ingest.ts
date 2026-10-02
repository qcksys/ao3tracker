import { diagnosticRequestSchema } from "@qcksys/ao3tracker-core/diagnostics";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

type IngestEnv = {
  Bindings: Pick<
    CloudflareBindings,
    "POSTHOG_PROJECT_TOKEN" | "POSTHOG_REGION" | "ENVIRONMENT" | "DIAGNOSTICS_RATE_LIMITER"
  >;
};

export const ingestRouter = new Hono<IngestEnv>();

ingestRouter.post("/", bodyLimit({ maxSize: 2048 }), async (c) => {
  if (!c.env.POSTHOG_PROJECT_TOKEN) return c.body(null, 204);
  const { success } = await c.env.DIAGNOSTICS_RATE_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "unknown",
  });
  if (!success) return c.body(null, 429);
  if (c.req.header("Content-Type")?.split(";")[0] !== "application/json") {
    return c.body(null, 415);
  }
  const parsed = diagnosticRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.body(null, 400);
  const { sessionId, platform, data } = parsed.data;
  const { event, ...properties } = data;
  const host = c.env.POSTHOG_REGION === "eu" ? "eu.i.posthog.com" : "us.i.posthog.com";
  try {
    // Construct the outbound request: never forward auth, cookies, IPs or arbitrary destinations.
    const response = await fetch(`https://${host}/i/v0/e/`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: c.env.POSTHOG_PROJECT_TOKEN,
        distinct_id: sessionId,
        event: event === "screen_viewed" ? "$screen" : event,
        properties: {
          ...properties,
          ...(data.event === "screen_viewed" ? { $screen_name: data.screen } : {}),
          platform,
          environment: c.env.ENVIRONMENT,
          source: event.startsWith("webview_") ? "webview" : "native",
          $lib: "ao3tracker-kmp",
          $process_person_profile: false,
          $geoip_disable: true,
          $ip: null,
        },
      }),
    });
    await response.body?.cancel();
    return c.body(null, response.ok ? 204 : 502);
  } catch {
    return c.body(null, 502);
  }
});

ingestRouter.all("*", (c) => c.body(null, 404));
