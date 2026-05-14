import { defineConfig } from "vite-plus";
import base from "./vite.config";

/** AO3 tracking script — produces dist/ao3-tracking.min.js. */
export default defineConfig({
    ...base,
    build: {
        ...base.build,
        // The tracking config is the first to run; it owns the dist wipe so
        // stale outputs from earlier builds don't linger.
        emptyOutDir: true,
        lib: {
            entry: "./src/ao3-tracking.ts",
            formats: ["iife"],
            name: "Ao3TrackerWebView",
            fileName: () => "ao3-tracking.min.js",
        },
    },
});
