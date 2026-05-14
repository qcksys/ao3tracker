import { defineConfig } from "vite-plus";
import base from "./vite.config";

/** Scroll-restore script — produces dist/scroll-restore.min.js. */
export default defineConfig({
    ...base,
    build: {
        ...base.build,
        lib: {
            entry: "./src/scroll-restore.ts",
            formats: ["iife"],
            name: "Ao3TrackerScrollRestore",
            fileName: () => "scroll-restore.min.js",
        },
    },
});
