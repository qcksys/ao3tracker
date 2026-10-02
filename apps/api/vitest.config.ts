import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "test/e2e/**"] },
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
