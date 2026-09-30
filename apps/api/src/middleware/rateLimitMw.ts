import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";

/**
 * Per-user rate limit applied to every authenticated `/api/*` route. Keyed on
 * the session user id so abuse is throttled per account rather than per IP
 * (clients sit behind shared egress). Backed by the Cloudflare `ratelimit`
 * binding `API_RATE_LIMITER` (see wrangler.json). Fails open if the binding is
 * absent (e.g. in unit tests) so a missing binding can never block traffic.
 */
export const apiRateLimitMw = createMiddleware<TRouterEnvAuthReq>(async (c, next) => {
  const limiter = c.var.env.API_RATE_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({
      key: `user:${c.var.user.id}`,
    });
    if (!success) {
      throw new HTTPException(429, {
        message: "Too many requests, please slow down",
      });
    }
  }
  await next();
});

/**
 * Stricter per-user limit for endpoints that proxy outbound fetches to AO3
 * (work parsing, backup creation). These are the costliest routes and the most
 * attractive to abuse the worker as a scraping proxy, so call this at the top
 * of those handlers in addition to {@link apiRateLimitMw}. Backed by the
 * `AO3_PROXY_RATE_LIMITER` binding. Fails open if the binding is absent.
 */
export async function enforceAo3ProxyLimit(c: Context<TRouterEnvAuthReq>): Promise<void> {
  const limiter = c.var.env.AO3_PROXY_RATE_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({
      key: `user:${c.var.user.id}`,
    });
    if (!success) {
      throw new HTTPException(429, {
        message: "Too many AO3 fetch requests, please slow down",
      });
    }
  }
}
