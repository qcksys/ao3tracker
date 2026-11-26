import { createRequire } from "node:module";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

const requireFromPg = createRequire(createRequire(import.meta.url).resolve("pg"));

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    // The Cloudflare pool inlines cached modules into one WebSocket message that can exceed
    // workerd's 32 MiB limit: https://github.com/cloudflare/workers-sdk/issues/16349
    fsModuleCache: false,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "pg-protocol": requireFromPg.resolve("pg-protocol"),
      "pg-pool": requireFromPg.resolve("pg-pool"),
    },
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2025-11-18",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
});
