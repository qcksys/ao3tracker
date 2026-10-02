import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const upstream = vi.fn<typeof fetch>();
const limit = vi.fn().mockResolvedValue({ success: true });
const bindings = {
  POSTHOG_PROJECT_TOKEN: "server-project-token",
  POSTHOG_REGION: "eu",
  ENVIRONMENT: "dev",
  DIAGNOSTICS_RATE_LIMITER: { limit },
};
const exception = {
  event: "$exception",
  distinct_id: "61adb426-a822-46df-85cb-59dd33960798",
  uuid: "b43916fb-46e7-4d0d-9a1b-ab267e36935b",
  timestamp: "2026-10-02T07:00:00.000Z",
  properties: {
    $exception_list: [
      {
        type: "IllegalStateException",
        value: "Saved Searches failed",
        mechanism: { type: "UncaughtExceptionHandler", handled: false },
        stacktrace: { type: "raw", frames: [{ filename: "SearchesScreen.kt", lineno: 42 }] },
      },
    ],
    $exception_level: "fatal",
    $app_version: "0.1.0-dev",
    $app_build: "123",
    $session_id: "08f95a84-ef8f-4f69-9c5e-471c49744144",
    email: "private@example.test",
    $ip: "192.0.2.1",
    $current_url: "https://archiveofourown.org/works/1",
  },
};
const batch = { api_key: "client-queue-namespace", batch: [exception] };

async function request(
  body: BodyInit = JSON.stringify(batch),
  headers: Record<string, string> = {},
  env = bindings,
  path = "/batch/",
) {
  return worker.fetch(
    new Request(`https://dev.ao3tracker.com/ingest/native${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    }),
    env,
  );
}

function forwardedBody() {
  const body = upstream.mock.calls[0]?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected JSON body");
  return JSON.parse(body);
}

beforeEach(() => {
  upstream.mockReset().mockResolvedValue(new Response("1"));
  limit.mockReset().mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe("native PostHog crash proxy", () => {
  it("preserves crash identity, timestamp, stack and release while removing client credentials", async () => {
    const response = await request(undefined, {
      Authorization: "Bearer private",
      Cookie: "session=private",
      "CF-Connecting-IP": "192.0.2.1",
    });
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]?.[0]).toBe("https://eu.i.posthog.com/batch/");
    expect(upstream.mock.calls[0]?.[1]?.headers).toEqual({ "Content-Type": "application/json" });
    const body = forwardedBody();
    expect(body.api_key).toBe(bindings.POSTHOG_PROJECT_TOKEN);
    expect(body.batch[0]).toMatchObject({
      uuid: exception.uuid,
      timestamp: exception.timestamp,
      distinct_id: exception.distinct_id,
      properties: {
        $exception_list: exception.properties.$exception_list,
        $app_version: "0.1.0-dev",
        $app_build: "123",
        environment: "dev",
        $ip: null,
        $geoip_disable: true,
        $process_person_profile: false,
      },
    });
    expect(body.batch[0].properties).not.toHaveProperty("email");
    expect(body.batch[0].properties).not.toHaveProperty("$current_url");
    expect(upstream.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("accepts gzip batches from native SDKs and bounds the decompressed body", async () => {
    expect(
      (await request(gzipSync(JSON.stringify(batch)), { "Content-Encoding": "gzip" })).status,
    ).toBe(200);
    expect(forwardedBody().batch[0].uuid).toBe(exception.uuid);
    upstream.mockClear();
    expect(
      (
        await request(gzipSync(JSON.stringify({ ...batch, padding: "x".repeat(1024 * 1024) })), {
          "Content-Encoding": "gzip",
        })
      ).status,
    ).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns retryable failures for upstream errors, rate limits, and missing configuration", async () => {
    upstream.mockRejectedValueOnce(new Error("offline"));
    expect((await request()).status).toBe(503);
    upstream.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await request()).status).toBe(503);
    upstream.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    );
    const throttled = await request();
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBe("120");
    expect((await request(undefined, {}, { ...bindings, POSTHOG_PROJECT_TOKEN: "" })).status).toBe(
      503,
    );
    limit.mockResolvedValue({ success: false });
    expect((await request()).status).toBe(429);
  });

  it("rejects arbitrary SDK events, malformed bodies, and unapproved proxy destinations", async () => {
    expect(
      (await request(JSON.stringify({ batch: [{ ...exception, event: "$identify" }] }))).status,
    ).toBe(400);
    expect((await request("{")).status).toBe(400);
    expect((await request("not gzip", { "Content-Encoding": "gzip" })).status).toBe(400);
    expect((await request(undefined, { "Content-Encoding": "br" })).status).toBe(415);
    expect((await request(undefined, {}, bindings, "/https://example.com")).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("proxies SDK config with the server token and no forwarded credentials", async () => {
    upstream.mockResolvedValueOnce(Response.json({ autocaptureExceptions: true }));
    const response = await worker.fetch(
      new Request("https://dev.ao3tracker.com/ingest/native/array/client-queue-namespace/config", {
        headers: { Cookie: "private", Authorization: "Bearer private" },
      }),
      bindings,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ autocaptureExceptions: true });
    expect(upstream.mock.calls[0]?.[0]).toBe(
      "https://eu-assets.i.posthog.com/array/server-project-token/config",
    );
    expect(upstream.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });
});
