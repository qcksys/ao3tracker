import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { PROD_ENV_NAME } from "~/const";
import type { AppEnv } from "~/index";
import { androidAppFingerprints } from "~/lib/android-app";

const assetLinksRoute = createRoute({
  method: "get",
  path: "assetlinks.json",
  summary: "Asset Links",
  description: "Provides the Asset Links file for app association.",
  request: {},
  responses: {
    200: {
      description: "Asset Links file",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              relation: z.array(z.string()),
              target: z.object({
                namespace: z.string(),
                package_name: z.string(),
                sha256_cert_fingerprints: z.array(z.string()),
              }),
            }),
          ),
        },
      },
    },
  },
});

export const wellKnownRouter = new OpenAPIHono<AppEnv>().openapi(assetLinksRoute, async (c) => {
  const packages =
    c.var.env.ENVIRONMENT === PROD_ENV_NAME
      ? ["com.qcksys.ao3tracker"]
      : ["com.qcksys.ao3tracker", "com.qcksys.ao3tracker.dev"];
  return c.json(
    packages.map((packageName) => ({
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: androidAppFingerprints(c.var.env.ENVIRONMENT),
      },
    })),
  );
});
