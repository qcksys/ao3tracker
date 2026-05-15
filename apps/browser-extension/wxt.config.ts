import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type WxtViteConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ["storage", "activeTab", "alarms", "notifications"],
    name: "ao3 Tracker",
    description:
      "Cross device tracking for AO3. Automatically syncs your position in any work you open across devices.",
    host_permissions: [
      "https://archiveofourown.org/*",
      // Must mirror `apiBaseUrlPresets` in lib/storage.ts.
      "https://ao3tracker.com/*",
      "https://dev.ao3tracker.com/*",
      "https://qcksys-ao3tracker-api-local.ta2.dev/*",
      "https://ao3tracker.localhost/*",
    ],
  },
  modules: ["@wxt-dev/module-react"],
  // Cast around a vite version mismatch between WXT and @tailwindcss/vite's
  // Plugin types. They behave identically at runtime.
  vite: (): WxtViteConfig => ({
    plugins: tailwindcss() as unknown as WxtViteConfig["plugins"],
  }),
  alias: {
    "~popup": resolve("./entrypoints/popup"),
  },
  webExt: {
    startUrls: ["https://archiveofourown.org/"],
  },
});
