import { createMiddleware } from "hono/factory";
import type { TRouterEnvAuth } from "~/middleware/authMw";

export type TRouterEnvAuthReq = TRouterEnvAuth & {
    Variables: {
        user: NonNullable<TRouterEnvAuth["Variables"]["user"]>;
        session: NonNullable<TRouterEnvAuth["Variables"]["session"]>;
    };
};

export const requireAuthMw = createMiddleware<TRouterEnvAuthReq>(
    async (c, next) => {
        if (!c.var.user) {
            return c.json({ message: "Unauthorized" }, 401);
        }
        if (!c.var.session) {
            return c.json({ message: "Unauthorized" }, 401);
        }
        await next();
    },
);
