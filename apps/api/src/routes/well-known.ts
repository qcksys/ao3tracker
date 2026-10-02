import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "~/index";
import { androidAppAssociations } from "~/lib/android-app";

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
  return c.json(
    androidAppAssociations(c.var.env.ENVIRONMENT).map(({ packageName, fingerprints }) => ({
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    })),
  );
});
