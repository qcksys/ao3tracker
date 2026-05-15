import { defineConfig } from "vite-plus";

/**
 * `@qcksys/ao3tracker-core` is consumed as TypeScript source by every client
 * (`workspace:*` deps). We don't ship a build artefact, but we still need a
 * `vite.config.ts` so `vp test` honours the `~/*` → `./src/*` paths from
 * [tsconfig.json](./tsconfig.json) and runs happy-dom for the DOM helpers.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
