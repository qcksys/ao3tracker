import { defineConfig } from "vite-plus";

/**
 * Shared base config — concrete entry-specific configs live alongside this
 * file (`vite.tracking.config.ts`, `vite.scroll-restore.config.ts`) because
 * vite refuses multi-entry IIFE bundles. The `build` script chains them.
 *
 * `resolve.tsconfigPaths` lets vite honour the `~/*` -> `./src/*` mapping
 * declared in [tsconfig.json](./tsconfig.json) for both `vp build` and `vp test`.
 */
export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    build: {
        outDir: "dist",
        emptyOutDir: false,
        minify: true,
        target: "es2018",
    },
    test: {
        environment: "happy-dom",
        include: ["src/**/*.test.ts"],
    },
});
