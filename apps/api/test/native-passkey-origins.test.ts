import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import type { AppEnv } from "~/index";
import { androidPasskeyOrigins } from "~/lib/android-app";
import { auth } from "~/lib/auth";
import { wellKnownRouter } from "~/routes/well-known";
import config from "../wrangler.json";

const uploadOrigin = "android:apk-key-hash:vwMjBYSkEHuHYEN6YS7iH7EIANfwT0JlYDdMnNtRCFA";
const prodPlayFingerprint =
  "53:4D:7E:AC:AF:81:EB:B8:4C:74:B1:22:D1:3A:C1:61:83:20:E3:24:5D:24:F7:D4:60:E7:3C:22:CD:AF:41:B8";
const prodPlayOrigin = "android:apk-key-hash:U01-rK-B67hMdLEi0TrBYYMg4yRdJPfUYOc8Is2vQbg";
const devPlayFingerprint =
  "78:BD:64:99:EF:60:BF:50:8D:73:A2:5B:DC:C2:8D:E9:B3:91:34:41:23:37:08:9C:DD:EF:88:85:14:A4:66:FE";
const devPlayOrigin = "android:apk-key-hash:eL1kme9gv1CNc6Jb3MKN6bORNEEjNwic3e-IhRSkZv4";

describe("native passkey origins", () => {
  it("isolates Play signing keys by environment and retains sideloaded builds", () => {
    expect(androidPasskeyOrigins("prod")).toEqual([uploadOrigin, prodPlayOrigin]);
    expect(androidPasskeyOrigins("dev")).toHaveLength(3);
    expect(androidPasskeyOrigins("dev")).toContain(uploadOrigin);
    expect(androidPasskeyOrigins("dev")).toContain(devPlayOrigin);
    expect(androidPasskeyOrigins("local")).toContain(devPlayOrigin);
    expect(androidPasskeyOrigins("dev")).not.toContain(prodPlayOrigin);
    expect(androidPasskeyOrigins("local")).not.toContain(prodPlayOrigin);
  });

  for (const environment of ["local", "dev", "prod"] as const) {
    it(`${environment} configures explicit WebAuthn origins and matching app associations`, async () => {
      const vars = environment === "local" ? config.vars : config.env[environment].vars;
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
      expect(plugin?.options?.origin).toContain(uploadOrigin);
      expect(plugin?.options?.origin).toContain(
        environment === "prod" ? prodPlayOrigin : devPlayOrigin,
      );
      expect(plugin?.options?.origin).not.toContain(
        environment === "prod" ? devPlayOrigin : prodPlayOrigin,
      );
      expect(plugin?.options?.origin).not.toContain("android:apk-key-hash:untrusted");
      expect(plugin?.options?.origin).not.toContain("https://attacker.example");

      const app = new OpenAPIHono<AppEnv>();
      app.use("*", async (context, next) => {
        context.set("env", env);
        await next();
      });
      app.route("/.well-known", wellKnownRouter);
      const response = await app.request("/.well-known/assetlinks.json");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const links = await response.json<
        Array<{
          relation: string[];
          target: { package_name: string; sha256_cert_fingerprints: string[] };
        }>
      >();
      expect(links.map((link) => link.target.package_name)).toEqual(
        environment === "prod"
          ? ["com.qcksys.ao3tracker"]
          : ["com.qcksys.ao3tracker", "com.qcksys.ao3tracker.dev"],
      );
      for (const link of links) {
        expect(link.relation).toContain("delegate_permission/common.get_login_creds");
        if (link.target.package_name === "com.qcksys.ao3tracker.dev") {
          expect(link.target.sha256_cert_fingerprints).toContain(devPlayFingerprint);
        } else {
          expect(link.target.sha256_cert_fingerprints).not.toContain(devPlayFingerprint);
        }
        if (environment === "prod") {
          expect(link.target.sha256_cert_fingerprints).toContain(prodPlayFingerprint);
        } else {
          expect(link.target.sha256_cert_fingerprints).not.toContain(prodPlayFingerprint);
        }
      }
    });
  }
});
