import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/db.client";
import { auth } from "~/lib/auth";
import config from "../wrangler.json";

const chromeOrigin = "chrome-extension://hjonebiohecalkggemeneaaohafldkkl";
const previousChromeOrigin = "chrome-extension://blgkokkfdhkkgaghemkodncmjfjbpjdc";
const firefoxDevOrigin = "moz-extension://9f7fd2ce-5e43-4d3e-9d4e-92f89126df55";

async function authRequest(environment: "dev" | "prod") {
  const vars = config.env[environment].vars;
  const db = createDbConnection("mysql://test:test@localhost/origin-test");
  vi.spyOn(db.$client, "execute").mockRejectedValue(
    new Error("Origin and invalid-payload tests must not query the database"),
  );
  const instance = auth({
    env: {
      ...vars,
      BETTER_AUTH_SECRET: "test-secret-only-for-origin-regressions-123456",
    } as CloudflareBindings,
    db,
  });
  const context = await instance.$context;
  expect(context.rateLimit.enabled).toBe(true);
  expect(context.rateLimit.storage).toBe("database");
  // Keep the real limiter and handler, replacing persistence only in this fixture.
  context.rateLimit.storage = "memory";

  return (path: string, headers: Record<string, string> = {}) =>
    instance.handler(
      new Request(`${vars.BETTER_AUTH_URL}/auth${path}`, {
        method: "POST",
        headers: {
          Origin: chromeOrigin,
          Cookie: "unrelated=value",
          "Content-Type": "application/json",
          "CF-Connecting-IP": environment === "dev" ? "198.51.100.10" : "198.51.100.11",
          ...headers,
        },
        body: "{}",
      }),
    );
}

describe("extension auth origins", () => {
  for (const environment of ["dev", "prod"] as const) {
    it(`${environment} accepts store and previous development Chrome identities and rejects unrelated origins`, async () => {
      const request = await authRequest(environment);
      expect((await request("/sign-out")).status).toBe(200);
      expect((await request("/sign-out", { Origin: previousChromeOrigin })).status).toBe(200);
      expect(
        (
          await request("/sign-out", {
            Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          })
        ).status,
      ).toBe(403);
      expect((await request("/sign-out", { Origin: "https://attacker.example" })).status).toBe(403);
    });
    it(`${environment} limits the fixed Firefox development UUID to development`, async () => {
      const request = await authRequest(environment);
      expect((await request("/sign-out", { Origin: firefoxDevOrigin })).status).toBe(
        environment === "dev" ? 200 : 403,
      );
    });
  }
});

describe("Cloudflare auth rate limits", () => {
  it("isolates client IPs and ignores spoofed forwarded headers", async () => {
    const request = await authRequest("prod");
    const headers = { "CF-Connecting-IP": "198.51.100.100" };
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request("/sign-in/email", {
        ...headers,
        "X-Forwarded-For": `203.0.113.${attempt + 1}`,
      });
      // Invalid credentials still reach the real request-schema validation.
      expect(response.status).toBe(400);
    }
    expect(
      (
        await request("/sign-in/email", {
          ...headers,
          "X-Forwarded-For": "203.0.113.200",
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await request("/sign-in/email", {
          "CF-Connecting-IP": "198.51.100.101",
          "X-Forwarded-For": "203.0.113.200",
        })
      ).status,
    ).toBe(400);
  });
});
