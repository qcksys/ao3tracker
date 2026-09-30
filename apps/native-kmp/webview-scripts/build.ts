/**
 * Build script for the WebView IIFE bundles.
 *
 * Vite forbids multi-entry IIFE library mode (one entry per IIFE), so we use
 * the programmatic `build()` API in a loop instead — the pattern recommended
 * in vitejs/vite#1736. This keeps the config in one place and runs in a
 * single command.
 *
 * Resolves `~/*` → `./src/*` via `resolve.tsconfigPaths` (Vite 8 / Rolldown
 * built-in support for tsconfig path mappings).
 */
import { build } from "vite";

interface Entry {
  entry: string;
  name: string;
  fileName: string;
}

const entries: Entry[] = [
  {
    entry: "./src/ao3-tracking.ts",
    name: "Ao3TrackerWebView",
    fileName: "ao3-tracking.min.js",
  },
  {
    entry: "./src/scroll-restore.ts",
    name: "Ao3TrackerScrollRestore",
    fileName: "scroll-restore.min.js",
  },
];

for (const [i, entry] of entries.entries()) {
  await build({
    configFile: false,
    resolve: { tsconfigPaths: true },
    build: {
      outDir: "dist",
      // First entry wipes dist/; subsequent entries preserve siblings.
      emptyOutDir: i === 0,
      minify: true,
      target: "es2018",
      lib: {
        entry: entry.entry,
        formats: ["iife"],
        name: entry.name,
        fileName: () => entry.fileName,
      },
    },
  });
}
