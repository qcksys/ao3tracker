import { defineConfig } from "vite-plus";

/**
 * Test/type-check config for vitest. The actual IIFE build lives in
 * [build.ts](./build.ts), which calls vite's programmatic `build()` API in a
 * loop (per vitejs/vite#1736) — vite refuses multi-entry IIFE in library mode,
 * but the programmatic API has no such restriction.
 *
 * `resolve.tsconfigPaths` lets vite/vitest honour the `~/*` -> `./src/*`
 * mapping declared in [tsconfig.json](./tsconfig.json).
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
