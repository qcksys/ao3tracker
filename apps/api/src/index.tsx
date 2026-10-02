import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import type { Auth, BetterAuthOptions } from "better-auth";
import type { Context } from "hono";
import { env } from "hono/adapter";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { timing } from "hono/timing";
import { PROD_ENV_NAME } from "~/const";
import { parseAllowedOrigins } from "~/lib/origins";
import { authMw } from "~/middleware/authMw";
import { startupMw, type TRouterEnvFw } from "~/middleware/startupMw";
import { queue } from "~/queue/handler";
import { apiRouter } from "~/routes/api";
import { ingestRouter } from "~/routes/ingest";
import { wellKnownRouter } from "~/routes/well-known";
import { scheduled } from "~/scheduled/handler";
import { LandingPage } from "~/views/landing-page";
import { PrivacyPage } from "~/views/privacy-page";
import { ResetPasswordPage } from "~/views/reset-password-page";

// `Auth<O>` is invariant in `O`, so callers passing the inferred narrow-options
// Auth from `~/lib/auth` can't widen to `Auth<BetterAuthOptions>`. Making the
// helper generic lets the call site flow its options type through.
async function generateAuthOpenAPISchema<O extends BetterAuthOptions>(
  auth: Auth<O>,
): Promise<object> {
  // Better Auth's api.generateOpenAPISchema is not exposed in types but exists at runtime
  const api = auth.api as { generateOpenAPISchema?: () => Promise<object> };
  if (typeof api.generateOpenAPISchema !== "function") {
    throw new Error("Auth instance does not support OpenAPI schema generation");
  }
  return api.generateOpenAPISchema();
}

const appRouter = new OpenAPIHono<AppEnv>();

const openApiConfig = {
  openapi: "3.1.0",
  info: {
    version: "0.0.1",
    title: "ao3tracker-api",
    contact: {
      name: "Tom Alle",
      email: "tom@qcksys.com",
    },
  },
};

appRouter.get("/privacy", (c) => c.html(<PrivacyPage />));
appRouter.route("/ingest", ingestRouter);

appRouter.use(timing());
// Restrict CORS to the configured web origins (see `ALLOWED_ORIGINS`). Read
// per-request via the adapter since this middleware runs before `startupMw`
// populates `c.var.env`. Native and extension clients reach the API through
// host_permissions / non-browser HTTP and don't depend on CORS headers.
appRouter.use(
  cors({
    origin: (origin, c) => {
      const allowed = parseAllowedOrigins(
        (env(c) as unknown as CloudflareBindings).ALLOWED_ORIGINS,
      );
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: false,
  }),
);
appRouter.use(startupMw);
appRouter.use(authMw);

appRouter.doc31("/app.openapi.json", (_c) => openApiConfig);
appRouter.get("/auth.openapi.json", async (c) => {
  const schema = await generateAuthOpenAPISchema(c.var.auth);
  return c.json(schema);
});

appRouter.get(
  "/openapi",
  Scalar({
    theme: "purple",
    sources: [
      {
        url: "/app.openapi.json",
        title: "App",
      },
      {
        url: "/auth.openapi.json",
        title: "Auth",
      },
    ],
  }),
);

appRouter.get("/llms.txt", async (c) =>
  c.text(
    await createMarkdownFromOpenApi(JSON.stringify(appRouter.getOpenAPI31Document(openApiConfig))),
  ),
);
appRouter.get("/llms-auth.txt", async (c) => {
  const schema = await generateAuthOpenAPISchema(c.var.auth);
  return c.text(await createMarkdownFromOpenApi(JSON.stringify(schema)));
});

appRouter.all("/ping", (c) => {
  return c.json({ ping: "pong" });
});

appRouter.get("/robots.txt", (c) => {
  const isProd = c.var.env.ENVIRONMENT === PROD_ENV_NAME;
  if (isProd) {
    return c.text("User-agent: *\nAllow: /\n");
  }
  return c.text("User-agent: *\nDisallow: /\n");
});

appRouter.get("/", (c) => c.html(<LandingPage />));

appRouter.get("/reset-password", (c) => c.html(<ResetPasswordPage />));

appRouter.on(["POST", "GET"], "/auth/*", (c) => c.var.auth.handler(c.req.raw));

appRouter.route("/api", apiRouter);
appRouter.route("/.well-known", wellKnownRouter);

appRouter.all("*", () => {
  throw new HTTPException(404, { message: "Not found" });
});

export type AppEnv = TRouterEnvFw;
export type AppContext = Context<AppEnv>;

export default {
  fetch: appRouter.fetch,
  scheduled,
  queue,
};
