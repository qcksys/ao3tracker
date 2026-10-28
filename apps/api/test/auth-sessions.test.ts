import { describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { auth } from "~/lib/auth";
import config from "../wrangler.json";

async function authInstance() {
  const vars = config.env.prod.vars;
  const db = createDbConnection("mysql://test:test@localhost/session-test");
  vi.spyOn(db.$client, "execute").mockRejectedValue(
    new Error("Session regression tests must not query the database"),
  );
  const instance = auth({
    env: {
      ...vars,
      BETTER_AUTH_SECRET: "test-secret-only-for-session-regressions-123456",
    } as CloudflareBindings,
    db,
  });
  return { instance, baseUrl: vars.BETTER_AUTH_URL };
}

describe("session revocation", () => {
  it("revokes every session when a password is reset", async () => {
    const { instance } = await authInstance();
    const context = await instance.$context;
    expect(context.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("does not serve list-sessions, which would expose other sessions' bearer tokens", async () => {
    const { instance, baseUrl } = await authInstance();
    const response = await instance.handler(
      new Request(`${baseUrl}/auth/list-sessions`, {
        headers: {
          Authorization: "Bearer any-session-token",
          "CF-Connecting-IP": "198.51.100.20",
        },
      }),
    );
    expect(response.status).toBe(404);
  });
});
