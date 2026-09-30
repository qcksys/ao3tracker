import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createDbConnection, type TDatabase } from "~/db/db.client";
import type { AppEnv } from "~/index";
import { auth } from "~/lib/auth";

export type TRouterEnvFw = {
  Variables: {
    db: TDatabase;
    env: CloudflareBindings;
    auth: ReturnType<typeof auth>;
  };
};

export const startupMw = createMiddleware<AppEnv>(async (c, next) => {
  const e = env(c) as unknown as CloudflareBindings;

  const db = createDbConnection(e.DATABASE_URL);
  const authInstance = auth({ env: e, db });

  c.set("env", e);
  c.set("db", db);
  c.set("auth", authInstance);

  await next();
});
