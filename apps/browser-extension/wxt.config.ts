import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ["storage", "activeTab", "background"],
    name: "ao3 Tracker",
    description:
      "Cross device tracking for ao3. Automatically syncs you position in any work you open across devices.",
    host_permissions: [
      "https://archiveofourown.org/*",
      "https://ao3tracker.qcksys.app/*",
    ],
  },
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  alias: {
    "~popup": resolve("./entrypoints/popup"),
  },
});
