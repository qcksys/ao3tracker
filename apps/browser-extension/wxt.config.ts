import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type WxtViteConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ mode }) => ({
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxXdx/FXNpFkXnnB9f+MpRWELgk9YuI8cdnywQWH95yUmrdfanorSW2Sx5+TeYKdMqkliKe3NkRJMCnMpZm1PD8hONGyK40VWXwEBPUdXVJOMF0pIDRJtdA56r9rgAlulMXmXmVUQr0tOKhny6b/SPxiA0PtDqQwE4Mf2619GleqKjQ/Smb6gGry8bOZX71HgocglenMeWunLeG27TXOt+Crqu93lw7T57hTY7ojJYYjI3OoDa4pisaizoWHwJX+hT1pRBySoYLsrGuE5AeVeeJQgRpmbFMPk3u6nzrTAlf7wYddcYbmSfveN+A0ODLztr0FOPUQyEQ5CkDhWL3DloQIDAQAB",
    browser_specific_settings: {
      gecko: { id: "ao3tracker@qcksys.com" },
    },
    permissions: ["storage", "activeTab", "alarms", "notifications"],
    name: "ao3 Tracker",
    description:
      "Cross device tracking for AO3. Automatically syncs your position in any work you open across devices.",
    // Production ships only the real api endpoints; the proxy/local dev hosts
    // are stripped so a tampered base url can't redirect the bearer token.
    // Must mirror `availableApiBaseUrlPresets` in lib/storage.ts.
    host_permissions:
      mode === "production"
        ? [
            "https://archiveofourown.org/*",
            "https://ao3tracker.com/*",
            "https://dev.ao3tracker.com/*",
          ]
        : [
            "https://archiveofourown.org/*",
            "https://ao3tracker.com/*",
            "https://dev.ao3tracker.com/*",
            "https://qcksys-ao3tracker-api-local.ta2.dev/*",
            "https://ao3tracker.localhost/*",
          ],
  }),
  modules: ["@wxt-dev/module-react"],
  // Cast around a vite version mismatch between WXT and @tailwindcss/vite's
  // Plugin types. They behave identically at runtime.
  vite: (): WxtViteConfig => ({
    resolve: {
      tsconfigPaths: true,
    },
    plugins: tailwindcss() as unknown as WxtViteConfig["plugins"],
  }),
  alias: {
    "~popup": resolve("./entrypoints/popup"),
  },
  webExt: {
    firefoxPref: {
      "extensions.webextensions.uuids": JSON.stringify({
        "ao3tracker@qcksys.com": "9f7fd2ce-5e43-4d3e-9d4e-92f89126df55",
      }),
    },
    startUrls: ["https://archiveofourown.org/"],
  },
});
