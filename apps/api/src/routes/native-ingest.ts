import { gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

type IngestEnv = {
  Bindings: Pick<
    CloudflareBindings,
    "POSTHOG_PROJECT_TOKEN" | "POSTHOG_REGION" | "ENVIRONMENT" | "DIAGNOSTICS_RATE_LIMITER"
  >;
};

const maxBodyBytes = 1024 * 1024;
const eventSchema = z.object({
  event: z.literal("$exception"),
  uuid: z.uuid().optional(),
  timestamp: z.string().max(64).optional(),
  distinct_id: z.string().min(1).max(200).optional(),
  properties: z
    .record(z.string(), z.json())
    .refine(
      (properties) =>
        Array.isArray(properties.$exception_list) && properties.$exception_list.length > 0,
    ),
});
const batchSchema = z.object({
  batch: z.array(eventSchema).min(1).max(50),
  sent_at: z.string().max(64).optional(),
});

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
    throw new HTTPException(415);
  }
  const encoding = request.headers.get("Content-Encoding");
  if (encoding && encoding !== "gzip") throw new HTTPException(415);
  const stream = request.body;
  if (!stream) throw new HTTPException(400);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) throw new HTTPException(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoded =
      encoding === "gzip" ? gunzipSync(bytes, { maxOutputLength: maxBodyBytes }) : bytes;
    return JSON.parse(new TextDecoder().decode(decoded));
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    if (error instanceof RangeError) {
      throw new HTTPException(413);
    }
    throw new HTTPException(400);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function sanitizeEvent(event: z.infer<typeof eventSchema>, environment: string) {
  const properties = Object.fromEntries(
    Object.entries(event.properties).filter(
      ([key]) =>
        key.startsWith("$exception_") ||
        [
          "$lib",
          "$lib_version",
          "$os",
          "$os_version",
          "$app_namespace",
          "$app_version",
          "$app_build",
          "$device_manufacturer",
          "$device_model",
          "$device_type",
          "$session_id",
          "app_build_time",
        ].includes(key),
    ),
  );
  return {
    ...event,
    properties: {
      ...properties,
      distinct_id: event.distinct_id ?? event.properties.distinct_id,
      environment,
      source: "native",
      $process_person_profile: false,
      $geoip_disable: true,
      $ip: null,
    },
  };
}

export const nativeIngestRouter = new Hono<IngestEnv>({ strict: false });

nativeIngestRouter.use("*", async (c, next) => {
  // Never acknowledge a crash unless the upstream has accepted it.
  if (!c.env.POSTHOG_PROJECT_TOKEN) return c.body(null, 503);
  const { success } = await c.env.DIAGNOSTICS_RATE_LIMITER.limit({
    key: c.req.header("CF-Connecting-IP") ?? "unknown",
  });
  if (!success) {
    c.header("Retry-After", "60");
    return c.body(null, 429);
  }
  await next();
});

nativeIngestRouter.on("POST", ["/batch", "/batch/"], async (c) => {
  const parsed = batchSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success) return c.body(null, 400);
  const region = c.env.POSTHOG_REGION === "eu" ? "eu" : "us";
  try {
    const response = await fetch(`https://${region}.i.posthog.com/batch/`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        api_key: c.env.POSTHOG_PROJECT_TOKEN,
        batch: parsed.data.batch.map((event) => sanitizeEvent(event, c.env.ENVIRONMENT)),
      }),
    });
    await response.body?.cancel();
    if (response.status === 429) {
      c.header("Retry-After", response.headers.get("Retry-After") ?? "60");
      return c.body(null, 429);
    }
    return c.body(null, response.ok ? 200 : 503);
  } catch {
    return c.body(null, 503);
  }
});

nativeIngestRouter.get("/array/:token/config", async (c) => {
  const region = c.env.POSTHOG_REGION === "eu" ? "eu" : "us";
  try {
    const response = await fetch(
      `https://${region}-assets.i.posthog.com/array/${encodeURIComponent(c.env.POSTHOG_PROJECT_TOKEN)}/config`,
      { redirect: "manual", signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return c.body(null, 503);
    }
    return new Response(response.body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return c.body(null, 503);
  }
});

nativeIngestRouter.all("*", (c) => c.body(null, 404));
