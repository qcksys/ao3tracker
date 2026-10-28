import { createMiddleware } from "hono/factory";
import type { TRouterEnvAuth } from "~/middleware/authMw";

export const ADMIN_ROLE = "admin";

/** Only paths under /admin are accepted as a post-sign-in destination, so it is never an open redirect */
export function adminReturnPath(path: string | undefined): string {
  return path?.startsWith("/admin") && !path.startsWith("//") ? path : "/admin";
}

/**
 * Gate the server-rendered admin pages: no session redirects to the admin sign-in page,
 * a non-admin session gets 403, and an unsafe method must come from this site's own origin.
 * Better Auth's cookies are SameSite=Lax, so the Origin check covers form posts from other sites.
 */
export const requireAdminMw = createMiddleware<TRouterEnvAuth>(async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  if (!c.var.user || !c.var.session) {
    const url = new URL(c.req.url);
    return c.redirect(
      `/admin/sign-in?next=${encodeURIComponent(adminReturnPath(url.pathname + url.search))}`,
    );
  }
  if (c.var.user.role !== ADMIN_ROLE) {
    return c.text("This account is not an administrator.", 403);
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const expected = new URL(c.var.env.BETTER_AUTH_URL).origin;
    if (c.req.header("Origin") !== expected) {
      return c.text("Request origin not allowed.", 403);
    }
  }
  await next();
});
