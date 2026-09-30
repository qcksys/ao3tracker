import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { bearer, openAPI, twoFactor } from "better-auth/plugins";
import { LOCAL_ENV_NAME, PROD_ENV_NAME } from "~/const";
import type { TDatabase } from "~/db/db.client";
import { getLastSentAt, recordEmailSent } from "~/db/queries/email-send-log";
import { rAuthAccount, tAuthAccount } from "~/db/schema/auth.account";
import type { EmailSendType } from "~/db/schema/auth.emailSendLog";
import { rAuthPasskey, tAuthPasskey } from "~/db/schema/auth.passkey";
import { tAuthRateLimit } from "~/db/schema/auth.rateLimit";
import { rAuthSession, tAuthSession } from "~/db/schema/auth.session";
import { rAuthTwoFactor, tAuthTwoFactor } from "~/db/schema/auth.twoFactor";
import { rAuthUser, tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { sendEmail } from "~/lib/email";
import { parseAllowedOrigins } from "~/lib/origins";

/**
 * Minimum seconds between successive system emails of the same `type` to the
 * same recipient. Per-recipient gate that complements Better Auth's built-in
 * per-IP rate-limit (see `rateLimit` below).
 */
const EMAIL_COOLDOWN_SECONDS: Record<EmailSendType, number> = {
  password_reset: 60,
  email_verification: 60,
};

/**
 * Returns `true` when an email of the given type was sent to `email` within
 * the cooldown window. The auth layer uses this to skip duplicate sends
 * silently — the caller still sees a success response (Better Auth doesn't
 * reveal whether the account exists), but no email goes out.
 */
async function isWithinCooldown(
  db: TDatabase,
  email: string,
  type: EmailSendType,
): Promise<boolean> {
  const lastSentAt = await getLastSentAt(db, email, type);
  if (!lastSentAt) return false;
  const elapsed = (Date.now() - lastSentAt.getTime()) / 1000;
  return elapsed < EMAIL_COOLDOWN_SECONDS[type];
}

export const auth = ({ env, db }: { env: CloudflareBindings; db: TDatabase }) => {
  // Origins (beyond `baseURL`, which Better Auth always trusts) permitted to
  // make state-changing auth requests. Sourced from `ALLOWED_ORIGINS` so the
  // same allow-list drives CORS (see ~/index) and CSRF/origin checks here.
  const trustedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  return betterAuth({
    appName: `QckSys AO3 Tracker ${env.ENVIRONMENT !== PROD_ENV_NAME ? `(${env.ENVIRONMENT})` : ""}`,
    basePath: "/auth",
    ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),
    experimental: {
      // joins: true,
    },
    /**
     * Per-client (per-IP) rate limit. Custom rules tighten the limits on
     * the auth flows most likely to be abused (sign-in, sign-up, password
     * reset, email verification). Sensible defaults match Better Auth's
     * recommended hardened settings.
     */
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 10, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/forget-password": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    advanced: {
      // Only disable the origin/CSRF check for truly local development.
      // `dev` is a publicly-routed deployment and must keep it enabled.
      disableOriginCheck: env.ENVIRONMENT === LOCAL_ENV_NAME,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
        ipv6Subnet: 64,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Wrapped to enforce a per-email cooldown on top of Better Auth's
      // per-IP rate limit. Better Auth only invokes this callback when
      // the account exists, so this naturally implements "only send for
      // accounts that exist".
      sendResetPassword: async ({ user, url }, _request) => {
        if (await isWithinCooldown(db, user.email, "password_reset")) {
          console.log({
            message: "Skipping password reset email (within cooldown)",
            userId: user.id,
          });
          return;
        }
        await sendEmail({
          binding: env.EMAIL,
          to: user.email,
          fromAddress: env.SYSTEM_EMAIL_ADDRESS,
          fromName: "QckSys AO3 Tracker",
          subject: "Reset your password",
          text:
            "We received a request to reset your AO3 Tracker password.\n\n" +
            `Click this link to set a new password: ${url}\n\n` +
            "If you didn't request this, you can safely ignore this email.\n" +
            "The link expires in 1 hour.",
        });
        await recordEmailSent(db, user.email, "password_reset");
        console.log({
          message: "Password reset email sent",
          userId: user.id,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }, _request) => {
        if (await isWithinCooldown(db, user.email, "email_verification")) {
          console.log({
            message: "Skipping verification email (within cooldown)",
            userId: user.id,
          });
          return;
        }
        await sendEmail({
          binding: env.EMAIL,
          to: user.email,
          fromAddress: env.SYSTEM_EMAIL_ADDRESS,
          fromName: "QckSys AO3 Tracker",
          subject: "Verify your email address",
          text:
            "Welcome to AO3 Tracker!\n\n" +
            `Click this link to verify your email: ${url}\n\n` +
            "If you didn't create an account, you can safely ignore this email.",
        });
        await recordEmailSent(db, user.email, "email_verification");
        console.log({
          message: "Verification email sent",
          userId: user.id,
        });
      },
      sendOnSignUp: true,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_ID,
        clientSecret: env.GOOGLE_SECRET,
      },
    },
    user: {
      fields: {},
    },
    plugins: [twoFactor(), passkey(), openAPI({ disableDefaultReference: true }), bearer()],
    database: drizzleAdapter(db, {
      provider: "mysql",
      schema: {
        account: tAuthAccount,
        accountRelations: rAuthAccount,
        passkey: tAuthPasskey,
        passkeyRelations: rAuthPasskey,
        session: tAuthSession,
        sessionRelations: rAuthSession,
        twoFactor: tAuthTwoFactor,
        twoFactorRelations: rAuthTwoFactor,
        user: tAuthUser,
        userRelations: rAuthUser,
        verification: tAuthVerification,
        rateLimit: tAuthRateLimit,
      },
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
  });
};
