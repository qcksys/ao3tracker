import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import type { AppEnv } from "~/index";
import { androidAppFingerprints, androidPasskeyOrigins } from "~/lib/android-app";
import { auth } from "~/lib/auth";
import { wellKnownRouter } from "~/routes/well-known";
import config from "../wrangler.json";

const releaseOrigin = "android:apk-key-hash:vwMjBYSkEHuHYEN6YS7iH7EIANfwT0JlYDdMnNtRCFA";

describe("native passkey origins", () => {
  it("accepts only the release signing key in production and includes the debug key in dev", () => {
    expect(androidPasskeyOrigins("prod")).toEqual([releaseOrigin]);
    expect(androidPasskeyOrigins("dev")).toHaveLength(2);
    expect(androidPasskeyOrigins("dev")).toContain(releaseOrigin);
  });

  for (const environment of ["dev", "prod"] as const) {
    it(`${environment} configures explicit WebAuthn origins and matching app associations`, async () => {
      const vars = config.env[environment].vars;
      const env = {
        ...vars,
        BETTER_AUTH_SECRET: "test-secret-only-for-native-passkey-regressions-123456",
      } as CloudflareBindings;
      const instance = auth({
        env,
        db: createDbConnection("mysql://test:test@localhost/passkey-test"),
      });
      const plugin = instance.options.plugins.find((entry) => entry.id === "passkey");
      expect(plugin?.options?.rpID).toBe(new URL(vars.BETTER_AUTH_URL).hostname);
      expect(plugin?.options?.origin).toContain(new URL(vars.BETTER_AUTH_URL).origin);
      expect(plugin?.options?.origin).toContain(releaseOrigin);
      expect(plugin?.options?.origin).not.toContain("android:apk-key-hash:untrusted");
      expect(plugin?.options?.origin).not.toContain("https://attacker.example");

      const app = new OpenAPIHono<AppEnv>();
      app.use("*", async (context, next) => {
        context.set("env", env);
        await next();
      });
      app.route("/", wellKnownRouter);
      const response = await app.request("/assetlinks.json");
      const links =
        await response.json<
          Array<{ target: { package_name: string; sha256_cert_fingerprints: string[] } }>
        >();
      expect(links.map((link) => link.target.package_name)).toEqual(
        environment === "prod"
          ? ["com.qcksys.ao3tracker"]
          : ["com.qcksys.ao3tracker", "com.qcksys.ao3tracker.dev"],
      );
      for (const link of links) {
        expect(link.target.sha256_cert_fingerprints).toEqual(androidAppFingerprints(environment));
      }
    });
  }
});
