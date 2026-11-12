/**
 * AO3's default site skin and its official dark skin, Reversi, vendored from otwarchive (see
 * `src/assets/ao3-skins/README.md`). Backup chapters carry them as their skin, so they look like
 * AO3 until the reader's own AO3 site skin has been captured on the device.
 */
import { AO3_BASE_URL } from "~/const";

export interface SiteStyle {
  css: string;
  media: string;
  sourceUrl: string;
}

const files = import.meta.glob<string>("../assets/ao3-skins/*.css.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The media AO3's `Skin.load_site_css` reads from a stylesheet's first line, defaulting to screen */
export function siteStyleMedia(css: string): string {
  const firstLine = css.split("\n", 1)[0];
  const list = firstLine.match(/MEDIA: (.*?) ENDMEDIA/)?.[1];
  if (list) return list.split(/,\s?/).join(", ");
  return firstLine.match(/MEDIA: (\w+)/)?.[1] ?? "screen";
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.txt$/, "");
}

const reversi = files["../assets/ao3-skins/reversi_site_screen_.css.txt"];

/** The default site skin in AO3's order, then Reversi for devices in dark mode */
export const ao3DefaultSkin: SiteStyle[] = [
  ...Object.entries(files)
    .filter(([path]) => /^\d+-/.test(fileName(path)))
    .sort(([a], [b]) => fileName(a).localeCompare(fileName(b)))
    .map(([path, css]) => ({
      css,
      media: siteStyleMedia(css),
      sourceUrl: `${AO3_BASE_URL}/stylesheets/site/2.0/${fileName(path)}`,
    })),
  {
    css: reversi,
    media: "screen and (prefers-color-scheme: dark)",
    sourceUrl: `${AO3_BASE_URL}/stylesheets/masters/reversi/reversi_site_screen_.css`,
  },
];
