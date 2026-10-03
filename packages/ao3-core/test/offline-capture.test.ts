// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { ao3Identity, captureOfflinePage, readingLocation, rewriteOfflineCss } from "~/offline";
import { offlinePageSchema } from "~/schemas/offline";
import { observeOfflinePage } from "~/offline/observation";

const url = "https://archiveofourown.org/works/123/chapters/456";

function page(head = "", text = "<p>Chapter text.</p>"): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html lang="en"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${head}</head><body class="logged-in javascript"><div id="outer" class="wrapper">
    <div id="greeting"><a href="/users/Reader">Reader</a></div>
    <div id="inner" class="wrapper"><div id="main" class="works-show region">
    <form action="${url}" method="post"><select id="selected_id">
      <option value="456" selected>1. Start</option><option value="789">2. Next</option>
    </select><input name="authenticity_token" value="secret"></form>
    <div id="work-skin" class="wrapper"><style>#workskin .message { color: purple }</style>
    <div id="workskin"><h2 class="title heading">A story</h2><div id="chapters">
    <div class="chapter" id="chapter-1"><div class="userstuff">${text}</div></div>
    </div></div></div></div></div></div></body></html>`,
    "text/html",
  );
}

describe("offline page capture", () => {
  it("observes identity and readability without changing the page or marking it read", () => {
    const doc = page();
    const before = doc.documentElement.outerHTML;
    expect(observeOfflinePage(doc, url)).toEqual({ url, identity: "user:Reader", readable: true });
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(observeOfflinePage(doc, "https://elsewhere.test/works/123")).toBeNull();
    doc.querySelector("#workskin")?.remove();
    expect(observeOfflinePage(doc, url)?.readable).toBe(false);
  });

  it("rejects contradictory or ambiguous AO3 identity evidence", () => {
    const doc = page();
    doc.body.classList.add("logged-out");
    expect(ao3Identity(doc, url)).toBeNull();
    doc.body.classList.remove("logged-out");
    doc
      .querySelector("#greeting")
      ?.insertAdjacentHTML("beforeend", '<a href="/users/Different">Different</a>');
    expect(ao3Identity(doc, url)).toBeNull();
    expect(observeOfflinePage(doc, url)?.readable).toBe(false);
  });

  it("observes a confirmed logout even on a page that cannot be downloaded", () => {
    const doc = new DOMParser().parseFromString(
      '<body class="logged-out"><h1>Log in</h1></body>',
      "text/html",
    );
    expect(observeOfflinePage(doc, "https://archiveofourown.org/users/login")).toEqual({
      url: "https://archiveofourown.org/users/login",
      identity: "guest",
      readable: false,
    });
  });

  it("retains the emitted skin order, inactive media and separate work styling", () => {
    const original = page(`<link rel="stylesheet" href="/stylesheets/base.css">
      <style>body { color: #ddd; background: #222 }</style>
      <style media="(prefers-color-scheme: light)">body { color: #222 }</style>
      <link rel="stylesheet" href="/stylesheets/narrow.css" media="only screen and (max-width: 42em)">`);
    const before = original.documentElement.outerHTML;
    const captured = captureOfflinePage(original, `${url}?scrollTo=20&_t=123#chapters`);

    expect(offlinePageSchema.safeParse(captured.page).success).toBe(true);
    expect(captured.page.siteStyles.map((style) => style.sourceUrl)).toEqual([
      "https://archiveofourown.org/stylesheets/base.css",
      `${url}?scrollTo=20&_t=123#chapters`,
      `${url}?scrollTo=20&_t=123#chapters`,
      "https://archiveofourown.org/stylesheets/narrow.css",
    ]);
    expect(captured.page.siteStyles.map((style) => style.media)).toEqual([
      "all",
      "all",
      "(prefers-color-scheme: light)",
      "only screen and (max-width: 42em)",
    ]);
    expect(captured.stylesheets.map((style) => style.index)).toEqual([0, 3]);
    expect(captured.page.html).toContain("#workskin .message");
    expect(captured.page.html).not.toContain("body { color:");
    expect(captured.page.html).toContain('class="logged-in javascript"');
    expect(captured.page.html).toContain('id="inner" class="wrapper"');
    expect(captured.page.html).toContain('name="viewport"');
    expect(captured.page.html).toContain('content="width=device-width, initial-scale=1"');
    expect(captured.page.url).toBe(url);
    expect(captured.page.ao3Identity).toBe("user:Reader");
    expect(captured.page.chapters.map((chapter) => chapter.id)).toEqual(["456", "789"]);
    expect(original.documentElement.outerHTML).toBe(before);
  });

  it("does not add a default stylesheet to an overriding skin", () => {
    const captured = captureOfflinePage(page("<style>body { background: black }</style>"), url);
    expect(captured.page.siteStyles).toHaveLength(1);
    expect(captured.stylesheets).toEqual([]);
  });

  it("removes executable content and tokens without destroying story formatting", () => {
    const doc = page(
      '<meta name="csrf-token" content="secret"><script>alert(1)</script>',
      `
      <p class="message" style="font-weight:bold" onclick="alert(1)">Hello <em>world</em></p>
      <img src="/images/art.png" onerror="alert(1)" srcset="https://remote.test/art.png 2x">
      <a href="javascript:alert(1)" ping="https://remote.test/track">Bad</a>
      <a href="/works/123/chapters/789#notes">Next notes</a>
      <iframe src="https://remote.test/embed"></iframe><svg onload="alert(1)"></svg>
      <div data-ao3-offline-style="42">Content</div>`,
    );
    const captured = captureOfflinePage(doc, url);
    const saved = new DOMParser().parseFromString(captured.page.html, "text/html");

    expect(
      saved.querySelector(
        "script, iframe, svg, input[name='authenticity_token'], meta[name='csrf-token']",
      ),
    ).toBeNull();
    expect(captured.page.html).not.toMatch(/secret|onclick|onerror|javascript:|srcset|ping=/);
    expect(saved.querySelector(".message")?.getAttribute("style")).toBe("font-weight:bold");
    expect(saved.querySelector(".message em")?.textContent).toBe("world");
    expect(saved.querySelector("img")?.getAttribute("src")).toBe(
      "https://archiveofourown.org/images/art.png",
    );
    expect(saved.querySelectorAll("a")[2]?.getAttribute("href")).toBe(
      `${url.replace("456", "789")}#notes`,
    );
    expect(saved.querySelector("div[data-ao3-offline-style]")).toBeNull();
    expect(saved.querySelectorAll("#selected_id option")).toHaveLength(2);
  });

  it("retains form styling hooks while disabling submission and stripping private values", () => {
    const doc = page();
    doc.body.insertAdjacentHTML(
      "beforeend",
      '<form id="search" class="search" action="/search" method="post"><input type="text" value="private search"><textarea>private draft</textarea><input type="hidden" value="secret"><input type="submit" value="Search"><button formaction="/write">Send</button></form>',
    );
    const captured = captureOfflinePage(doc, url);
    const saved = new DOMParser().parseFromString(captured.page.html, "text/html");
    expect(saved.querySelector("form#search.search")).not.toBeNull();
    expect(saved.querySelector("#search input[type='submit']")?.getAttribute("value")).toBe(
      "Search",
    );
    expect(saved.querySelectorAll("#search [disabled]")).toHaveLength(4);
    expect(captured.page.html).not.toMatch(
      /private search|private draft|secret|formaction=|action=|method=/,
    );
    expect(saved.querySelector("#selected_id")?.hasAttribute("disabled")).toBe(false);
  });

  it("never selects a preview as the active skin", () => {
    expect(captureOfflinePage(page(), `${url}?site_skin=12`).page.canSelectSkin).toBe(false);
    expect(captureOfflinePage(page(), url).page.canSelectSkin).toBe(true);
  });

  it.each([
    "<body class='logged-out'><h1>Log in</h1></body>",
    "<body class='logged-out'><h1>This work is restricted</h1></body>",
    "<body class='logged-out'><div id='workskin'><h2 class='title heading'>Warning</h2></div></body>",
  ])("rejects non-content pages", (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(() => captureOfflinePage(doc, url)).toThrow("accessible AO3 chapter");
  });

  it("rejects mismatched chapters and ambiguous identity", () => {
    expect(() => captureOfflinePage(page(), url.replace("456", "999"))).toThrow("does not match");
    const doc = page();
    doc.querySelector("#greeting")?.remove();
    expect(ao3Identity(doc, url)).toBeNull();
    expect(() => captureOfflinePage(doc, url)).toThrow("accessible AO3 chapter");
  });

  it("supports a logged-out single chapter without an assigned chapter ID", () => {
    const doc = page();
    doc.body.className = "logged-out";
    doc.querySelector("#selected_id")?.remove();
    const captured = captureOfflinePage(doc, "https://archiveofourown.org/works/123");
    expect(captured.page.chapterId).toBe("0");
    expect(captured.page.ao3Identity).toBe("guest");
    expect(captured.page.chapters).toHaveLength(1);
  });
});

describe("offline CSS resource rewriting", () => {
  it("preserves AO3's legacy IE gradient but rejects unparsed resources", () => {
    const legacy =
      "progid:DXImageTransform.Microsoft.gradient(startColorstr='#fadddddd', endColorstr='#facccccc',GradientType=0)";
    expect(rewriteOfflineCss(`body{filter:${legacy}}`, url, () => "")).toContain(legacy);
    expect(() =>
      rewriteOfflineCss(
        "body{filter:progid:DXImageTransform.Microsoft.gradient(src=url(https://example.test/image))}",
        url,
        () => "",
      ),
    ).toThrow("could not be saved completely");
  });

  it("preserves import conditions and rewrites relative URLs against the stylesheet", () => {
    const requests: { url: string; stylesheet: boolean }[] = [];
    const css = rewriteOfflineCss(
      `@import "../parent.css" layer(theme) screen;
      @media (max-width: 42em) { body { background: url('../img/bg.png') } }
      @font-face { font-family: Test; src: url(./test.woff2) }`,
      "https://archiveofourown.org/css/skin/main.css",
      (resource) => {
        requests.push(resource);
        return `/resources/${requests.length}`;
      },
    );
    expect(requests).toEqual([
      { url: "https://archiveofourown.org/css/parent.css", stylesheet: true },
      { url: "https://archiveofourown.org/css/img/bg.png", stylesheet: false },
      { url: "https://archiveofourown.org/css/skin/test.woff2", stylesheet: false },
    ]);
    expect(css).toMatch(/@import "\/resources\/1"\s*layer\(theme\) screen/);
    expect(css).toContain("@media (max-width:42em)");
    expect(css).toContain("url(/resources/2)");
  });

  it("handles escaped URLs and URLs in custom properties without changing text literals", () => {
    const resources: string[] = [];
    const css = rewriteOfflineCss(
      String.raw`body { --art: url(\2f images/bg.png); content: "url(fake.png)"; background: var(--art) }`,
      url,
      ({ url: asset }) => {
        resources.push(asset);
        return "/resources/art";
      },
    );
    expect(resources).toEqual(["https://archiveofourown.org/images/bg.png"]);
    expect(css).toContain('content:"url(fake.png)"');
    expect(css).toContain("--art:url(/resources/art)");
  });

  it("preserves local fragments and bounded embedded raster assets", () => {
    const css = rewriteOfflineCss(
      "p{filter:url(#shadow);background:url(data:image/png;base64,AAAA)}",
      url,
      () => {
        throw new Error("Unexpected fetch");
      },
    );
    expect(css).toContain("url(#shadow)");
    expect(css).toContain("data:image/png;base64,AAAA");
  });

  it("rewrites image-set strings while leaving its MIME type string intact", () => {
    const resources: string[] = [];
    const css = rewriteOfflineCss(
      'body{background:image-set("art.png" 1x type("image/png"),url(art@2x.png) 2x)}',
      url,
      ({ url: asset }) => {
        resources.push(asset);
        return `/resources/${resources.length}`;
      },
    );
    expect(resources).toEqual([
      "https://archiveofourown.org/works/123/chapters/art.png",
      "https://archiveofourown.org/works/123/chapters/art@2x.png",
    ]);
    expect(css).toContain('type("image/png")');
  });

  it.each(["javascript:alert(1)", "file:///private/file", "https://user:pass@example.com/asset"])(
    "rejects unsupported resource %s",
    (asset) => {
      expect(() => rewriteOfflineCss(`p{background:url("${asset}")}`, url, () => "")).toThrow(
        "unsupported address",
      );
    },
  );
});

describe("offline identity", () => {
  it("keeps representation options but removes app-owned position parameters", () => {
    expect(
      readingLocation(
        "https://www.archiveofourown.org:443/works/123?view_full_work=true&style=disable&scrollTo=10&_t=4#chapter_2",
      ),
    ).toEqual({
      url: "https://archiveofourown.org/works/123?view_full_work=true&style=disable",
      workId: "123",
      chapterId: null,
      representation: "whole",
    });
  });

  it.each([
    "https://archiveofourown.org.evil.test/works/123",
    "http://archiveofourown.org/works/123",
    "https://user@archiveofourown.org/works/123",
    "https://archiveofourown.org:444/works/123",
    "https://archiveofourown.org/works/123/navigate",
  ])("rejects %s", (value) => {
    expect(readingLocation(value)).toBeNull();
  });
});
