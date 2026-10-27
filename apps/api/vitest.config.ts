import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    // The Cloudflare pool inlines cached modules into one WebSocket message that can exceed
    // workerd's 32 MiB limit: https://github.com/cloudflare/workers-sdk/issues/16349
    fsModuleCache: false,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2025-11-18",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
});
