import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, expect, inject, it, vi } from "vitest";
import { z } from "zod";
import { createDbConnection } from "~/db/db.client";
import { tAuthAccount } from "~/db/schema/auth.account";
import { tEmailSendLog } from "~/db/schema/auth.emailSendLog";
import { tAuthPasskey } from "~/db/schema/auth.passkey";
import { tAuthRateLimit } from "~/db/schema/auth.rateLimit";
import { auth } from "~/lib/auth";
import config from "../../wrangler.json";

const db = createDbConnection(inject("databaseUrl"));
afterAll(() => db.$client.end());

it("reuses the same Google account on repeat sign-ins and persists its ID token", async () => {
  const origin = "http://localhost";
  const audience = "e2e-google-client";
  const subject = randomUUID();
  const email = `${subject}@example.test`;
  const instance = auth({
    db,
    env: {
      ...config.env.dev.vars,
      BETTER_AUTH_URL: origin,
      ALLOWED_ORIGINS: origin,
      GOOGLE_ID: audience,
      GOOGLE_SECRET: "e2e-google-secret",
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-deployment-123456789",
    } as unknown as CloudflareBindings,
  });
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = { ...(await exportJWK(publicKey)), kid: subject, alg: "RS256", use: "sig" };
  const token = await new SignJWT({ email, email_verified: true, name: "Synthetic Google reader" })
    .setProtectedHeader({ alg: "RS256", kid: subject })
    .setIssuer("https://accounts.google.com")
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const publicKeys = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(url).toBe("https://www.googleapis.com/oauth2/v3/certs");
    return Response.json({ keys: [key] });
  });
  try {
    const signIn = async () => {
      const response = await instance.handler(
        new Request(`${origin}/auth/sign-in/social`, {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            "cf-connecting-ip": "192.0.2.128",
          },
          body: JSON.stringify({ provider: "google", idToken: { token } }),
        }),
      );
      expect(response.status).toBe(200);
      return z
        .object({ user: z.object({ id: z.string(), email: z.literal(email) }) })
        .parse(await response.json()).user;
    };
    const first = await signIn();
    expect(await signIn()).toEqual(first);
    expect(
      await db.select().from(tAuthAccount).where(eq(tAuthAccount.userId, first.id)),
    ).toMatchObject([{ providerId: "google", accountId: subject, idToken: token }]);
  } finally {
    publicKeys.mockRestore();
  }
});

function authenticatorCode(uri: string) {
  const secret = z.string().min(1).parse(new URL(uri).searchParams.get("secret"));
  const bits = Array.from(secret.replace(/=+$/, ""), (letter) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(letter.toUpperCase()).toString(2).padStart(5, "0"),
  ).join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

it("verifies email, resets credentials, revokes sessions and authenticates a second factor in Postgres", async () => {
  const mail: string[] = [];
  const origin = "http://localhost";
  const email = `${randomUUID()}@example.test`;
  const password = "synthetic-password-before-reset";
  const newPassword = "synthetic-password-after-reset";
  const instance = auth({
    db,
    env: {
      ...config.env.dev.vars,
      BETTER_AUTH_URL: origin,
      ALLOWED_ORIGINS: origin,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-deployment-123456789",
      EMAIL: {
        send: async ({ text }: { text: string }) => {
          mail.push(text);
        },
      },
    } as unknown as CloudflareBindings,
  });
  const cookies = new Map<string, string>();
  async function call(path: string, body?: object) {
    const response = await instance.handler(
      new Request(new URL(path, `${origin}/auth/`), {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          "content-type": "application/json",
          "cf-connecting-ip": "192.0.2.127",
          cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
        },
        body: body && JSON.stringify(body),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0];
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async function ok(path: string, body?: object) {
    const response = await call(path, body);
    const value = await response.json();
    expect(response.status, path).toBe(200);
    return value;
  }
  const { user } = z
    .object({ user: z.object({ id: z.string(), emailVerified: z.literal(false) }) })
    .parse(await ok("sign-up/email", { name: "Reader", email, password }));
  expect((await call("sign-in/email", { email, password })).status).toBe(403);
  await ok("send-verification-email", { email });
  expect(mail).toHaveLength(1);
  const link = (message: string) =>
    new URL(z.url().parse(message.match(/http:\/\/localhost\/auth\/\S+/)?.[0]));
  expect((await call(link(mail[0]).href)).status).toBeLessThan(400);
  await ok("sign-in/email", { email, password });
  expect(await ok("get-session")).toMatchObject({ user: { id: user.id, emailVerified: true } });
  await ok("request-password-reset", { email });
  await ok("request-password-reset", { email });
  expect(mail).toHaveLength(2);
  expect(await db.select().from(tEmailSendLog).where(eq(tEmailSendLog.email, email))).toHaveLength(
    2,
  );
  const resetToken = link(mail[1]).pathname.split("/").pop();
  await ok("reset-password", { token: resetToken, newPassword });
  expect(await ok("get-session")).toBeNull();
  expect((await call("sign-in/email", { email, password })).status).toBe(401);
  await ok("sign-in/email", { email, password: newPassword });
  expect(await ok("passkey/generate-register-options")).toMatchObject({
    challenge: expect.any(String),
  });
  const passkeyId = randomUUID();
  await db.insert(tAuthPasskey).values({
    id: passkeyId,
    userId: user.id,
    name: "Test device",
    publicKey: "test-public-key",
    credentialID: randomUUID(),
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
  });
  expect(await ok("passkey/list-user-passkeys")).toMatchObject([
    { id: passkeyId, name: "Test device" },
  ]);
  await ok("passkey/update-passkey", { id: passkeyId, name: "Renamed device" });
  expect(await ok("passkey/list-user-passkeys")).toMatchObject([
    { id: passkeyId, name: "Renamed device" },
  ]);
  await ok("passkey/delete-passkey", { id: passkeyId });
  expect(await ok("passkey/list-user-passkeys")).toEqual([]);
  const enrollment = z
    .object({ totpURI: z.string(), backupCodes: z.array(z.string()).min(1) })
    .parse(await ok("two-factor/enable", { password: newPassword }));
  await ok("two-factor/verify-totp", { code: authenticatorCode(enrollment.totpURI) });
  expect(await ok("get-session")).toMatchObject({ user: { twoFactorEnabled: true } });
  await ok("sign-out", {});
  expect(await ok("sign-in/email", { email, password: newPassword })).toMatchObject({
    twoFactorRedirect: true,
  });
  await ok("two-factor/verify-backup-code", { code: enrollment.backupCodes[0] });
  expect(await ok("get-session")).toMatchObject({ user: { id: user.id } });
  expect((await db.select().from(tAuthRateLimit)).some((row) => row.count > 1)).toBe(true);
});
