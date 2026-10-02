import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const sessionId = "61adb426-a822-46df-85cb-59dd33960798";
const limit = vi.fn().mockResolvedValue({ success: true });
const upstream = vi.fn<typeof fetch>();
const bindings = {
  POSTHOG_PROJECT_TOKEN: "test-project-token",
  POSTHOG_REGION: "eu",
  ENVIRONMENT: "dev",
  DIAGNOSTICS_RATE_LIMITER: { limit },
};
const payload = { sessionId, platform: "android", data: { event: "app_opened" } };

function capturedBody(index = 0) {
  const body = upstream.mock.calls[index]?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(body);
}

function request(body: unknown = payload, extra: Record<string, string> = {}) {
  return worker.fetch(
    new Request("https://dev.ao3tracker.com/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extra },
      body: JSON.stringify(body),
    }),
    bindings,
  );
}

beforeEach(() => {
  limit.mockResolvedValue({ success: true });
  upstream.mockReset().mockImplementation(async (input, init) => {
    new Request(input, init);
    return new Response("ok");
  });
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe("native diagnostic ingestion", () => {
  it("works without database/auth bindings and strips client credentials and IPs", async () => {
    const response = await request(payload, {
      Authorization: "Bearer private-token",
      Cookie: "private-session",
      "CF-Connecting-IP": "192.0.2.1",
    });
    expect(response.status).toBe(204);
    const firstCall = upstream.mock.calls[0];
    if (!firstCall) throw new Error("Missing upstream request");
    const [url, options] = firstCall;
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(options?.headers).toEqual({ "Content-Type": "application/json" });
    expect(capturedBody()).toEqual({
      api_key: "test-project-token",
      distinct_id: sessionId,
      event: "app_opened",
      properties: {
        platform: "android",
        environment: "dev",
        source: "native",
        $lib: "ao3tracker-kmp",
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: null,
      },
    });
    expect(limit).toHaveBeenCalledWith({ key: "192.0.2.1" });
  });

  it("maps native screen views and accepts WebView events", async () => {
    expect(
      (await request({ ...payload, data: { event: "screen_viewed", screen: "works" } })).status,
    ).toBe(204);
    expect(capturedBody()).toMatchObject({
      event: "$screen",
      properties: { $screen_name: "works" },
    });
    expect(
      (await request({ ...payload, data: { event: "webview_error", kind: "promise" } })).status,
    ).toBe(204);
    expect(capturedBody(1)).toMatchObject({
      event: "webview_error",
      properties: { source: "webview", kind: "promise" },
    });
  });

  it.each([
    { ...payload, url: "https://archiveofourown.org/works/1" },
    { ...payload, data: { event: "webview_error", kind: "script", message: "private text" } },
    { ...payload, data: { event: "$identify" } },
    { ...payload, data: { event: "screen_viewed", screen: "private search" } },
    { ...payload, sessionId: "user@example.com" },
    { ...payload, api_key: "another-project" },
  ])("rejects private or arbitrary data %#", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("limits bodies and rate-limits requests before forwarding", async () => {
    expect((await request({ ...payload, extra: "x".repeat(3000) })).status).toBe(413);
    limit.mockResolvedValue({ success: false });
    expect((await request()).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unsupported content types", async () => {
    expect((await request(payload, { "Content-Type": "text/plain" })).status).toBe(415);
    const response = await worker.fetch(
      new Request("https://dev.ao3tracker.com/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      bindings,
    );
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("uses the Worker environment and cannot be redirected by the client", async () => {
    const response = await worker.fetch(
      new Request("https://ao3tracker.com/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { ...bindings, ENVIRONMENT: "prod", POSTHOG_PROJECT_TOKEN: "production-test-token" },
    );
    expect(response.status).toBe(204);
    expect(capturedBody()).toMatchObject({
      api_key: "production-test-token",
      properties: { environment: "prod" },
    });
    expect(upstream.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([301, 302, 307, 308])("rejects upstream redirects (%s)", async (status) => {
    upstream.mockImplementation(async (input, init) => {
      expect(new Request(input, init).redirect).toBe("manual");
      return new Response(null, { status, headers: { Location: "https://example.com" } });
    });
    expect((await request()).status).toBe(502);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("returns a bounded failure when PostHog is unavailable", async () => {
    upstream.mockRejectedValueOnce(new Error("offline"));
    expect((await request()).status).toBe(502);
    upstream.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await request()).status).toBe(502);
  });
});
