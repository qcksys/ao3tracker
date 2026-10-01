import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type WxtViteConfig } from "wxt";
import { chromeReleaseVersion } from "./lib/chrome-release-version";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser, mode }) => ({
    ...(browser === "chrome"
      ? chromeReleaseVersion(process.env.CHROME_VERSION, process.env.CHROME_VERSION_NAME)
      : {}),
    key:
      mode === "beta"
        ? process.env.CHROME_BETA_PUBLIC_KEY || undefined
        : "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwoFnrwaltyQEw7hZV6gFzRSwoRKf+VM6adpYolUqVHbVTFigHouyfHOh9GklK4bMIWHBluh5mxmpVnKoaettN+eCytERoTZ4FnGcEVQzJmY778jf6kw5e9ZivP+T5c1+5NzB1sPABr4HQ4qbAOXg1lipUfi0I/ccvfVgoTaCoy62tUrNwRnnkQYqnQvGGb+0VmozPAvq/kX4sMkVbqU98Uai8V1sogXkH8tJwhGrixs7L9atPZkyvV43EbQ3vqEBrL/NY/R61TI6/HxQ0TOWaqOjI39yarRLnFm4JgsAgb56BRtCSR4KSd3ZUjpmp+5nlWToWuW8CqeV80BuMm3CUwIDAQAB",
    browser_specific_settings: {
      gecko: { id: "ao3tracker@qcksys.com" },
    },
    permissions: ["storage", "activeTab", "alarms", "notifications"],
    name: mode === "beta" ? "AO3 Tracker Beta" : "ao3 Tracker",
    description:
      mode === "beta"
        ? "Beta testing build of AO3 Tracker. Syncs reading progress with the development API."
        : "Cross device tracking for AO3. Automatically syncs your position in any work you open across devices.",
    // Production ships only the real api endpoints; the proxy/local dev hosts
    // are stripped so a tampered base url can't redirect the bearer token.
    // Must mirror `availableApiBaseUrlPresets` in lib/storage.ts.
    host_permissions:
      mode === "beta"
        ? ["https://archiveofourown.org/*", "https://dev.ao3tracker.com/*"]
        : mode === "production"
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
  zip: {
    artifactTemplate: "{{name}}-{{version}}-{{browser}}{{modeSuffix}}.zip",
  },
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
