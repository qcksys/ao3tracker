/**
 * Better Auth CLI configuration file
 *
 * Docs: https://www.better-auth.com/docs/concepts/cli
 */
import "./src/env";
import { createDbConnection } from "~/db/db.client";
import { auth as betterAuthApp } from "~/lib/auth";

const env = process.env as unknown as CloudflareBindings;

const db = createDbConnection(env.DATABASE_URL);

export const auth = betterAuthApp({ env, db });
