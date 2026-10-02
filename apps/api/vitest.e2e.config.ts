import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/e2e/*.test.ts"],
    globalSetup: ["./test/e2e/global-setup.ts"],
    fileParallelism: false,
    environment: "node",
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
