import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type WxtViteConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ["storage", "activeTab", "alarms"],
    name: "ao3 Tracker",
    description:
      "Cross device tracking for AO3. Automatically syncs your position in any work you open across devices.",
    host_permissions: [
      "https://archiveofourown.org/*",
      "https://ao3tracker.qcksys.app/*",
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
});
