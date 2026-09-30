import { createMiddleware } from "hono/factory";
import type { TRouterEnvFw } from "~/middleware/startupMw";
import type { auth } from "../../better-auth.config"; // Need to use the config that is not a function for the correct types

export type TRouterEnvAuth = TRouterEnvFw & {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
};

export const authMw = createMiddleware<TRouterEnvAuth>(async (c, next) => {
  const session = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
