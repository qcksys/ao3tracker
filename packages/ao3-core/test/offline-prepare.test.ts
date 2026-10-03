// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vite-plus/test";
import { captureOfflinePage, prepareOfflinePage, renderOfflinePage } from "~/offline";
import type { OfflineFetch, OfflineDigest } from "~/offline";
import { offlineBundleSchema } from "~/schemas/offline";
import type { OfflineResourceData } from "~/schemas/offline";

const url = "https://archiveofourown.org/works/123";
const digest: OfflineDigest = async (bytes) => createHash("sha256").update(bytes).digest("hex");
const encoder = new TextEncoder();

function capture(
  styles = '<link rel="stylesheet" href="/stylesheets/custom.css">',
  content = "<p>Hello</p>",
) {
  const doc = new DOMParser().parseFromString(
    `<html><head>${styles}</head>
    <body class="logged-out"><div id="workskin"><h2 class="title heading">Story</h2>
    <div id="chapters"><div class="userstuff">${content}</div></div></div></body></html>`,
    "text/html",
  );
  return captureOfflinePage(doc, url);
}

function fetcher(entries: Record<string, [string, string]>): OfflineFetch {
  return async (source) => {
    const entry = entries[source];
    if (!entry) throw new Error("Missing resource");
    return { url: source, mimeType: entry[0], bytes: encoder.encode(entry[1]) };
  };
}

describe("offline resource preparation", () => {
  it("packages nested CSS, inactive media, fonts and images with local content addresses", async () => {
    const stored: OfflineResourceData[] = [];
    const fetch = vi.fn(
      fetcher({
        "https://archiveofourown.org/stylesheets/custom.css": [
          "text/css",
          '@import "parent.css" screen; body{background:url(../art.png)}',
        ],
        "https://archiveofourown.org/stylesheets/parent.css": [
          "text/css",
          "@font-face{font-family:Readable;src:url(font.woff2)}",
        ],
        "https://archiveofourown.org/stylesheets/font.woff2": ["font/woff2", "FONT"],
        "https://archiveofourown.org/art.png": ["image/png", "IMAGE"],
        "https://archiveofourown.org/dark.css": ["text/css", "body{color:white}"],
      }),
    );
    const result = await prepareOfflinePage(
      capture(
        '<link rel="stylesheet" href="/stylesheets/custom.css"><link rel="stylesheet" href="/dark.css" media="(prefers-color-scheme: dark)">',
        '<img src="/art.png">',
      ),
      fetch,
      digest,
      async (resource) => {
        stored.push(resource);
      },
    );

    expect(offlineBundleSchema.safeParse(result).success).toBe(true);
    expect(result.resources).toHaveLength(5);
    expect(result.missingResources).toEqual([]);
    expect(fetch.mock.calls.filter(([source]) => source.endsWith("art.png"))).toHaveLength(1);
    const styles = stored.filter((resource) => resource.mimeType === "text/css");
    for (const style of styles) {
      const css = atob(style.base64);
      expect(css).not.toMatch(/https:|parent\.css|art\.png|font\.woff2/);
    }
    expect(result.page.siteStyles[1].media).toBe("(prefers-color-scheme: dark)");
    expect(result.page.html).toMatch(/src="\/resources\/[a-f0-9]{64}"/);
  });

  it("changes the skin fingerprint when bytes change at the same URL", async () => {
    const first = await prepareOfflinePage(
      capture(),
      fetcher({
        "https://archiveofourown.org/stylesheets/custom.css": ["text/css", "body{color:red}"],
      }),
      digest,
    );
    const second = await prepareOfflinePage(
      capture(),
      fetcher({
        "https://archiveofourown.org/stylesheets/custom.css": ["text/css", "body{color:blue}"],
      }),
      digest,
    );
    expect(first.skinHash).not.toBe(second.skinHash);
    expect(first.page.html).toBe(second.page.html);
  });

  it("refuses incomplete stylesheets, including redirects to login HTML", async () => {
    await expect(prepareOfflinePage(capture(), fetcher({}), digest)).rejects.toThrow(
      "Missing resource",
    );
    await expect(
      prepareOfflinePage(
        capture(),
        fetcher({ "https://archiveofourown.org/stylesheets/custom.css": ["text/html", "Login"] }),
        digest,
      ),
    ).rejects.toThrow("stylesheet could not");
  });

  it("reports missing media and retains readable text", async () => {
    const fetch = vi.fn(fetcher({}));
    const result = await prepareOfflinePage(
      capture(
        "<style>body{color:white;background:url(/missing.png)}</style>",
        '<p>Story</p><img src="/missing.png" alt="Illustration">',
      ),
      fetch,
      digest,
    );
    expect(result.missingResources).toEqual(["https://archiveofourown.org/missing.png"]);
    expect(result.page.siteStyles[0].css).toContain("about:blank");
    expect(result.page.html).toContain("<p>Story</p>");
    expect(result.page.html).toContain('alt="Illustration"');
    expect(result.page.html).not.toContain('src="');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not swallow cancellation or memory limits as missing optional images", async () => {
    await expect(
      prepareOfflinePage(
        capture("", '<img src="/art.png">'),
        async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
        digest,
      ),
    ).rejects.toThrow("Cancelled");
    await expect(
      prepareOfflinePage(
        capture("", '<img src="/art.png">'),
        async (source) => ({
          url: source,
          mimeType: "image/png",
          bytes: new Uint8Array(16 * 1024 * 1024 + 1),
        }),
        digest,
      ),
    ).rejects.toThrow("download limit");
  });

  it("does not turn a failed content hash into an optional missing image", async () => {
    await expect(
      prepareOfflinePage(
        capture("", '<img src="/art.png">'),
        fetcher({ "https://archiveofourown.org/art.png": ["image/png", "ART"] }),
        async () => {
          throw new Error("Hash failed");
        },
      ),
    ).rejects.toThrow("Hash failed");
  });

  it("rejects cyclic imports without repeatedly fetching them", async () => {
    const fetch = vi.fn(
      fetcher({
        "https://archiveofourown.org/stylesheets/custom.css": ["text/css", '@import "custom.css";'],
      }),
    );
    await expect(prepareOfflinePage(capture(), fetch, digest)).rejects.toThrow("circular import");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resolves resources against the final stylesheet URL after a redirect", async () => {
    const requested: string[] = [];
    const result = await prepareOfflinePage(
      capture(),
      async (source) => {
        requested.push(source);
        if (source.endsWith("custom.css"))
          return {
            url: "https://archiveofourown.org/new/skin.css",
            mimeType: "text/css",
            bytes: encoder.encode("p{background:url(art.png)}"),
          };
        return { url: source, mimeType: "image/png", bytes: encoder.encode("ART") };
      },
      digest,
    );
    expect(result.resources).toHaveLength(2);
    expect(requested[1]).toBe("https://archiveofourown.org/new/art.png");
  });
});

describe("offline rendering", () => {
  it("uses a replacement site skin without altering saved chapter content", async () => {
    const bundle = await prepareOfflinePage(
      capture("<style>body{color:red}</style>"),
      fetcher({}),
      digest,
    );
    const before = bundle.page.html;
    const html = renderOfflinePage(bundle.page, [
      { css: "body{color:blue}", sourceUrl: url, media: "screen", disabled: false },
    ]);
    expect(html).toContain("body{color:blue}");
    expect(html).not.toContain("body{color:red}");
    expect(bundle.page.html).toBe(before);
    expect(html).toContain("<p>Hello</p>");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(doc.head.firstElementChild?.getAttribute("content")).toContain("connect-src 'none'");
  });

  it("prevents CSS strings from terminating their HTML style element", async () => {
    const bundle = await prepareOfflinePage(capture(""), fetcher({}), digest);
    const html = renderOfflinePage(bundle.page, [
      {
        css: 'p::before{content:"</style><script>alert(1)</script>"}',
        sourceUrl: url,
        media: "all",
        disabled: false,
      },
    ]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("style")?.textContent).toContain("\\3c /style>");
  });
});
