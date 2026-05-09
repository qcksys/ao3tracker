import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "~/index";

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

export const wellKnownRouter = new OpenAPIHono<AppEnv>().openapi(
    assetLinksRoute,
    async (c) => {
        return c.json([
            {
                relation: [
                    "delegate_permission/common.handle_all_urls",
                    "delegate_permission/common.get_login_creds",
                ],
                target: {
                    namespace: "android_app",
                    package_name: "com.qcksys.ao3tracker",
                    sha256_cert_fingerprints: [
                        "BF:03:23:05:84:A4:10:7B:87:60:43:7A:61:2E:E2:1F:B1:08:00:D7:F0:4F:42:65:60:37:4C:9C:DB:51:08:50", // Release fingerprint
                        "E4:F5:42:AE:8F:E7:6F:16:00:C9:69:02:49:35:59:85:A8:09:79:E5:B0:84:60:E1:C2:EE:AC:2C:64:7F:AA:3A", // Debug fingerprint
                    ],
                },
            },
        ]);
    },
);
