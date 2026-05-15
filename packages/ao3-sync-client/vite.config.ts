import { defineConfig } from "vite-plus";

/**
 * `@qcksys/ao3tracker-sync-client` is consumed as TypeScript source by the
 * browser extension (`workspace:*`). The vite config exists only so `vp test`
 * picks up the `~/*` → `./src/*` paths from [tsconfig.json](./tsconfig.json)
 * and runs the LWW unit tests under Node.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
