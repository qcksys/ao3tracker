import { OpenAPIHono } from "@hono/zod-openapi";
import { apiRateLimitMw } from "~/middleware/rateLimitMw";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";
import { requireAuthMw } from "~/middleware/requireAuthMw";
import { backupRouter } from "~/routes/api.backup";
import { parseRouter } from "~/routes/api.parse";
import { pushRouter } from "~/routes/api.push";
import { trackRouter } from "~/routes/api.track";

export const apiRouter = new OpenAPIHono<TRouterEnvAuthReq>()
  .use(requireAuthMw)
  .use(apiRateLimitMw)
  .route("/backup", backupRouter)
  .route("/parse", parseRouter)
  .route("/push", pushRouter)
  .route("/track", trackRouter);
