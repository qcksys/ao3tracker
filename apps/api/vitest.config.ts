import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
