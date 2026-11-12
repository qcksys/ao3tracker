import { expect, it } from "vitest";
import { ao3DefaultSkin, siteStyleMedia } from "~/lib/ao3-skins";

it("reads each stylesheet's media the way AO3's site skin loader does", () => {
  expect(
    siteStyleMedia("/* MEDIA: only screen and (max-width: 62em), handheld ENDMEDIA */\na{}"),
  ).toBe("only screen and (max-width: 62em), handheld");
  expect(siteStyleMedia("/* MEDIA: print */\na{}")).toBe("print");
  expect(siteStyleMedia("/* == CORE */\na{}")).toBe("screen");
});

it("orders AO3's default site skin like AO3 and adds Reversi for dark mode", () => {
  const sheets = ao3DefaultSkin.map(({ sourceUrl, media }) => [sourceUrl.split("/").pop(), media]);
  expect(sheets).toHaveLength(27);
  expect(sheets.slice(0, 2)).toEqual([
    ["01-core.css", "screen"],
    ["02-elements.css", "screen"],
  ]);
  expect(sheets.slice(-5)).toEqual([
    ["25-media-midsize.css", "only screen and (max-width: 62em), handheld"],
    ["26-media-narrow.css", "only screen and (max-width: 42em), handheld"],
    ["27-media-aural.css", "speech"],
    ["28-media-print.css", "print"],
    ["reversi_site_screen_.css", "screen and (prefers-color-scheme: dark)"],
  ]);
  expect(ao3DefaultSkin[0].sourceUrl).toBe(
    "https://archiveofourown.org/stylesheets/site/2.0/01-core.css",
  );
  expect(ao3DefaultSkin.every(({ css }) => css.length > 0)).toBe(true);
});
