import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { bearer, openAPI, twoFactor } from "better-auth/plugins";
import { PROD_ENV_NAME } from "~/const";
import type { TDatabase } from "~/db/db.client";
import { rAuthAccount, tAuthAccount } from "~/db/schema/auth.account";
import { rAuthPasskey, tAuthPasskey } from "~/db/schema/auth.passkey";
import { rAuthSession, tAuthSession } from "~/db/schema/auth.session";
import { rAuthTwoFactor, tAuthTwoFactor } from "~/db/schema/auth.twoFactor";
import { rAuthUser, tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";
import { sendEmail } from "~/lib/email";

export const auth = ({
    env,
    db,
}: {
    env: CloudflareBindings;
    db: TDatabase;
}) => {
    return betterAuth({
        appName: `QckSys AO3 Tracker ${env.ENVIRONMENT !== PROD_ENV_NAME ? `(${env.ENVIRONMENT})` : ""}`,
        basePath: "/auth",
        experimental: {
            // joins: true,
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            sendResetPassword: async ({ user, url }, _request) => {
                await sendEmail({
                    binding: env.EMAIL,
                    to: user.email,
                    fromAddress: env.SYSTEM_EMAIL_ADDRESS,
                    fromName: "QckSys AO3 Tracker",
                    subject: "Reset your password",
                    text: `Click the link to reset your password: ${url}`,
                });
            },
        },
        emailVerification: {
            sendVerificationEmail: async ({ user, url }, _request) => {
                await sendEmail({
                    binding: env.EMAIL,
                    to: user.email,
                    fromAddress: env.SYSTEM_EMAIL_ADDRESS,
                    fromName: "QckSys AO3 Tracker",
                    subject: "Verify your email address",
                    text: `Click the link to verify your email: ${url}`,
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
        plugins: [
            twoFactor(),
            passkey(),
            openAPI({ disableDefaultReference: true }),
            bearer(),
        ],
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
            },
        }),
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        advanced: {
            disableOriginCheck: env.ENVIRONMENT !== PROD_ENV_NAME,
        },
    });
};
