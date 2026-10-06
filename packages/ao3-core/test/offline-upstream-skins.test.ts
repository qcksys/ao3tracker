// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { captureOfflinePage, prepareOfflinePage } from "../src/offline";

const fixtureDirectory = resolve(
  "../../apps/native-kmp/composeApp/src/androidDeviceTest/assets/ao3-skins",
);
const files = readdirSync(fixtureDirectory).filter((name) => name.endsWith(".css.txt"));
it.each(files)("prepares the upstream AO3 stylesheet %s", async (file) => {
  const doc = new DOMParser().parseFromString(
    `<html><head><link rel="stylesheet" href="/${file}"></head><body class="logged-out"><div id="workskin"><h2 class="title heading">Fixture</h2><div id="chapters"><div class="userstuff">Fixture text</div></div></div></body></html>`,
    "text/html",
  );
  const bundle = await prepareOfflinePage(
    captureOfflinePage(doc, "https://archiveofourown.org/works/123"),
    async (url) => {
      if (new URL(url).pathname !== `/${file}`)
        throw new Error("Optional fixture asset unavailable");
      return {
        url,
        mimeType: "text/css",
        bytes: new TextEncoder().encode(readFileSync(resolve(fixtureDirectory, file), "utf8")),
      };
    },
  );
  expect(bundle.page.siteStyles).toHaveLength(1);
  expect(bundle.resources).toHaveLength(1);
});
