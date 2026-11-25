import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { findLatestActiveBackup } from "~/db/queries/backup";
import { isUserTrackingWork } from "~/db/queries/track";
import { findWorkChapters, getWorkState } from "~/db/queries/work";
import { ao3DefaultSkin } from "~/lib/ao3-skins";
import {
  type BackupPageChapter,
  backupChapterPage,
  type HtmlBackupContent,
  readHtmlBackup,
} from "~/lib/html-backup";
import { backupRouter } from "~/routes/api.backup";

vi.mock("~/db/queries/backup", () => ({
  findActiveBackupByR2Key: vi.fn(),
  findBackupsByWorkId: vi.fn(),
  findLatestActiveBackup: vi.fn(),
  upsertBackup: vi.fn(),
}));
vi.mock("~/db/queries/track", () => ({ isUserTrackingWork: vi.fn() }));
vi.mock("~/db/queries/work", () => ({ findWorkChapters: vi.fn(), getWorkState: vi.fn() }));

// Synthetic text in the markup of real AO3 HTML downloads (otwarchive's downloads/show.html.erb).
// Downloads made before AO3 moved to https link to http://archiveofourown.org.
const workNotes = `
    <p>Notes</p>
    <blockquote class="userstuff"><p>Work notes</p></blockquote>
    <div class="endnote-link">
      See the end of the work for <a href="#endnotes">more notes</a>
    </div>`;
const preface = (notes = workNotes) => `
<div id="preface">
  <h2 class="toc-heading">Preface</h2>
  <p class="message"><b>Backup Work</b><br />Posted originally on the <a href="http://archiveofourown.org/">Archive of Our Own</a> at <a href="http://archiveofourown.org/works/42">http://archiveofourown.org/works/42</a>.</p>
  <div class="meta">
    <dl class="tags">
      <dt>Fandoms:</dt>
      <dd><a href="http://archiveofourown.org/tags/Fandom%20(Video%20Game)">Fandom</a>, <a href="http://archiveofourown.org/tags/Other">Other</a></dd>
      <dt>Language:</dt>
      <dd>English</dd>
      <dt>Series:</dt>
      <dd>Part 2 of <a href="http://archiveofourown.org/series/9">Saga</a>, Part 1 of <a href="http://archiveofourown.org/series/10">Side Stories</a></dd>
      <dt>Stats:</dt>
      <dd>
        Published: 2025-09-03
        Updated: 2025-09-22
        Words: 5,782
        Chapters: 2/7
      </dd>
    </dl>
    <h1>Backup Work</h1>
    <div class="byline">by <a rel="author" href="http://archiveofourown.org/users/author/pseuds/author">author</a></div>
    <p>Summary</p>
    <blockquote class="userstuff"><p>Work summary <img src="/images/summary.png"></p></blockquote>
${notes}
    <ul>
      <li>
        Translation into <span lang="fr">Français</span> available: <a href="https://archiveofourown.org/works/43">Œuvre</a> by <a rel="author" href="https://archiveofourown.org/users/translator/pseuds/translator">translator</a>
      </li>
    </ul>
  </div>
</div>`;
// Translations are approved related works too, so a download can list none under the heading.
const afterword = (endNotes: string, inspired: string) => `
<div id="afterword">
  <h2 class="toc-heading">Afterword</h2>
  <div class="meta">${endNotes}
    <dl>
      <dt>Works inspired by this one</dt>
      ${inspired}
    </dl>
  </div>
  <p class="message">Please <a href="http://archiveofourown.org/works/42/comments/new">drop by the Archive and comment</a> to let the creator know if you enjoyed their work!</p>
</div>`;
const endNotes =
  '<div id="endnotes"><p>End Notes</p><blockquote class="userstuff"><p>Thanks</p></blockquote></div>';
const inspired = `<dd>
        <a href="https://archiveofourown.org/works/44">Podfic</a> by <a rel="author" href="https://archiveofourown.org/users/reader/pseuds/reader">reader</a>
      </dd>`;
const document = (
  chapters: string,
  after = afterword(endNotes, inspired),
  notes = workNotes,
) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>Backup Work - author - Fandom</title>
  <style type="text/css">#chapters { font-family: serif; }</style>
</head>
<body>
${preface(notes)}
<div id="chapters" class="userstuff">${chapters}</div>
${after}
</body>
</html>`;
const multiChapter = document(`
  <div class="meta group">
    <h2 class="heading">
      Chapter 1: Beginning $&amp; &lt;b&gt;
    </h2>
    <p class="byline">Chapter by <a rel="author" href="http://archiveofourown.org/users/guest/pseuds/guest">guest</a></p>
    <p>Chapter Summary</p>
    <blockquote class="userstuff"><p>Chapter summary</p></blockquote>
    <p>Chapter Notes</p>
    <blockquote class="userstuff"><p>Notes</p></blockquote>
    <div class="endnote-link">
      See the end of the chapter for <a href="#endnotes1">more notes</a>
    </div>
  </div>
  <!--chapter content-->
  <div class="userstuff">
    <p onclick="steal()">First <a href="javascript:alert(1)">bad</a> <a href="/works/7">relative</a></p>
    <script>steal()</script>
    <p><img src="https://example.com/one.png" alt="Map"><img src="data:image/png;base64,AA"></p>
  </div>
  <!--/chapter content-->
  <div class="meta" id="endnotes1"><p>Chapter End Notes</p><blockquote class="userstuff"><p>Bye</p></blockquote></div>
  <div class="meta group">
    <h2 class="heading">
      Chapter 2
    </h2>
  </div>
  <!--chapter content-->
  <div class="userstuff"><p>Second <iframe src="https://example.com"></iframe></p></div>
  <!--/chapter content-->
`);
const singleChapterText = `
  <h2 class="toc-heading">Backup Work</h2>
  <div class="userstuff"><p>Only chapter</p></div>
`;
// Without work notes or end notes, the download has no Notes label for the translations to follow.
const singleChapter = document(singleChapterText, afterword("", inspired), "");

async function read(html: string): Promise<HtmlBackupContent> {
  const content = await readHtmlBackup(html);
  if (!content) throw new Error("Not an AO3 download");
  return content;
}

describe("readHtmlBackup", () => {
  it("maps the work preface onto AO3's live work header", async () => {
    const { tags, heading, notes } = await read(multiChapter);
    expect(tags).toContain('<dl class="work meta group">');
    expect(tags).toContain(
      '<dt class="fandom tags">Fandoms:</dt>\n      <dd class="fandom tags"><ul class="commas">' +
        '<li><a href="https://archiveofourown.org/tags/Fandom%20(Video%20Game)" class="tag">Fandom</a></li>' +
        '<li><a href="https://archiveofourown.org/tags/Other" class="tag">Other</a></li></ul></dd>',
    );
    expect(tags).toContain('<dd class="language">English</dd>');
    expect(tags).toContain(
      '<dd class="series"><span class="series"><span class="position">Part 2 of <a href="https://archiveofourown.org/series/9">Saga</a></span></span>, ' +
        '<span class="series"><span class="position">Part 1 of <a href="https://archiveofourown.org/series/10">Side Stories</a></span></span></dd>',
    );
    expect(tags).toContain(
      '<dd class="stats"><dl class="stats"><dt class="published">Published:</dt><dd class="published">2025-09-03</dd>' +
        '<dt class="status">Updated:</dt><dd class="status">2025-09-22</dd><dt class="words">Words:</dt>' +
        '<dd class="words">5,782</dd><dt class="chapters">Chapters:</dt><dd class="chapters">2/7</dd></dl></dd>',
    );
    expect(heading).toBe(
      '<h2 class="title heading">Backup Work</h2><h3 class="byline heading"><a rel="author" href="https://archiveofourown.org/users/author/pseuds/author">author</a></h3>',
    );
    expect(notes).toMatch(
      /^<div class="summary module">\s*<h3 class="heading">Summary:<\/h3>\s*<blockquote class="userstuff"><p>Work summary <img alt="Image unavailable offline"><\/p><\/blockquote>\s*<\/div>/,
    );
    // AO3 lists associations before the notes and links to the end notes and inspired works.
    expect(notes).toMatch(
      /<div class="notes module">\s*<h3 class="heading">Notes:<\/h3><ul class="associations">\s*<li>\s*Translation into <span lang="fr">Français<\/span> available: <a href="https:\/\/archiveofourown\.org\/works\/43">Œuvre<\/a> by <a rel="author" href="https:\/\/archiveofourown\.org\/users\/translator\/pseuds\/translator">translator<\/a>\s*<\/li>\s*<\/ul>\s*<blockquote class="userstuff"><p>Work notes<\/p><\/blockquote>\s*<p class="jump">/,
    );
    expect(notes).toMatch(
      /<p class="jump">\(See the end of the work for <a href="#work_endnotes">more notes<\/a> and <a href="#children">other works inspired by this one<\/a>\.\)<\/p>\s*<\/div>$/,
    );
    expect(tags + heading + notes).not.toMatch(/toc-heading|Posted originally|http:|<!--/);
  });

  it("maps each chapter onto AO3's live chapter markup and removes what the reader must not run or fetch", async () => {
    const content = await read(multiChapter);
    expect(content.chapters).toHaveLength(2);
    const [first, second] = content.chapters;

    expect(first.html).toMatch(
      new RegExp(
        `^<div class="chapter preface group">\\s*${content.titleSlot}\\s*` +
          '<h4 class="heading byline">Chapter by <a rel="author" href="https://archiveofourown.org/users/guest/pseuds/guest">guest</a></h4>\\s*' +
          '<div id="summary" class="summary module"><h3 class="heading">Summary:</h3>',
      ),
    );
    // The download's heading keeps titles that AO3's chapter menu shortens.
    expect(content.chapters.map((chapter) => chapter.title)).toEqual([
      "Beginning $&amp; &lt;b&gt;",
      "",
    ]);
    // Unlike the work's, a chapter's end-notes link is not a `jump`, which skins space apart.
    expect(first.html).toMatch(
      /<div id="notes" class="notes module"><h3 class="heading">Notes:<\/h3>\s*<blockquote class="userstuff"><p>Notes<\/p><\/blockquote>\s*<p>\(See the end of the chapter for <a href="#chapter_1_endnotes">more notes<\/a>\.\)<\/p>/,
    );
    expect(first.html).toContain(
      '<div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Chapter Text</h3>',
    );
    expect(first.html).toContain(
      '<div class="chapter preface group"><div class="end notes module" id="chapter_1_endnotes"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>Bye</p></blockquote></div></div>',
    );
    expect(first.html).toContain('<a href="https://archiveofourown.org/works/7">relative</a>');
    expect(first.html).toContain("<a>bad</a>");
    expect(first.html).not.toMatch(/onclick|<script|steal\(\)|src=|Chapter 1: Beginning/);
    expect(first.html).toContain('<img alt="Map">');
    expect(first.html).not.toContain("Chapter 2");
    expect(first.images).toEqual([
      "https://archiveofourown.org/images/summary.png",
      "https://example.com/one.png",
    ]);

    expect(second.html).toMatch(
      new RegExp(`^<div class="chapter preface group">\\s*${content.titleSlot}\\s*</div>`),
    );
    expect(second.html).toContain("<p>Second </p>");
    expect(second.images).toEqual([]);

    expect(content.afterword).toMatch(
      new RegExp(
        '^<div id="work_endnotes" class="end notes module"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>Thanks</p></blockquote></div>' +
          '<div id="series" class="series module"><h3 class="heading">Series this work belongs to:</h3><ul>' +
          '<li><span class="series"><span class="position">Part 2 of <a href="https://archiveofourown.org/series/9">Saga</a></span></span></li>' +
          '<li><span class="series"><span class="position">Part 1 of <a href="https://archiveofourown.org/series/10">Side Stories</a></span></span></li></ul></div>' +
          '<div id="children" class="children module">\\s*<h3 class="heading">Works inspired by this one:</h3><ul>\\s*' +
          '<li>\\s*<a href="https://archiveofourown.org/works/44">Podfic</a> by <a rel="author" href="https://archiveofourown.org/users/reader/pseuds/reader">reader</a>\\s*</li>\\s*</ul></div>$',
      ),
    );
    expect(content.afterword).not.toMatch(/toc-heading|drop by the Archive/);
  });

  it("keeps a single-chapter work's text as one chapter without a chapter header", async () => {
    const content = await read(singleChapter);
    expect(content.chapters).toEqual([
      {
        html: '<h3 class="landmark heading" id="work">Work Text:</h3><div class="userstuff"><p>Only chapter</p></div>',
        title: "",
        // The preface is shown with the first chapter, so its images are reported there.
        images: ["https://archiveofourown.org/images/summary.png"],
      },
    ]);
    // AO3 gives a work with only associations and inspired works a notes module of its own.
    expect(content.notes).toMatch(
      /<\/div><div class="notes module"><h3 class="heading">Notes:<\/h3><ul class="associations">[\s\S]*<\/ul><p class="jump">\(See the end of the work for <a href="#children">other works inspired by this one<\/a>\.\)<\/p><\/div>$/,
    );
    expect(content.afterword).toMatch(
      /^<div id="series" class="series module">[\s\S]*<\/div><div id="children" class="children module">/,
    );
  });

  it("leaves out the inspired works section when the download lists only translations", async () => {
    const content = await read(document(singleChapterText, afterword("", ""), ""));
    expect(content.afterword).not.toContain("children");
    expect(content.notes).not.toMatch(/jump|inspired/);
    expect(content.notes).toContain('<ul class="associations">');
  });

  it("rejects files that are not AO3 work downloads", async () => {
    expect(await readHtmlBackup("<html><body><p>Log in</p></body></html>")).toBeNull();
    expect(await readHtmlBackup(document(""))).toBeNull();
  });
});

describe("backupChapterPage", () => {
  const pages = async (html: string) => {
    const content = await read(html);
    const chapters: BackupPageChapter[] = content.chapters.map((chapter, index) => ({
      number: index + 1,
      url: `https://archiveofourown.org/works/42/chapters/${101 + index}`,
      html: chapter.html,
    }));
    return chapters.map((_, position) =>
      backupChapterPage(content, "Backup &amp; Work", chapters, position),
    );
  };

  it("builds a complete AO3 chapter page with chapter navigation", async () => {
    const [first, second] = await pages(multiChapter);
    expect(first).toMatch(/^<html lang="en"><head><meta charset="utf-8">/);
    expect(first).toContain("<title>Backup &amp; Work - Chapter 1</title>");
    expect(first).toContain(
      '<div id="main" class="chapters-show region" role="main"><div class="work">',
    );
    expect(first).toContain(
      '<ul class="work navigation actions"><li class="chapter next"><a href="https://archiveofourown.org/works/42/chapters/102">Next Chapter →</a></li></ul>',
    );
    expect(first).toContain('<div class="wrapper"><dl class="work meta group">');
    expect(first).toContain(
      '<div id="work-skin" class="wrapper"><div id="workskin"><div class="preface group"><h2 class="title heading">Backup Work</h2>',
    );
    expect(first).toContain('<div class="summary module">');
    // AO3's chapter pages link the work's notes to the afterword on the last chapter's page.
    expect(first).toContain(
      '(See the end of the work for <a href="https://archiveofourown.org/works/42/chapters/102#work_endnotes">more notes</a> and <a href="https://archiveofourown.org/works/42/chapters/102#children">other works inspired by this one</a>.)',
    );
    expect(first).toContain(
      '<div id="chapters"><div class="chapter" id="chapter-1"><div class="chapter preface group">',
    );
    expect(first).toContain(
      '<h3 class="title"><a href="https://archiveofourown.org/works/42/chapters/101">Chapter 1</a>: Beginning $&amp; &lt;b&gt;</h3>',
    );
    // The shared progress tracker completes a chapter when this button is visible.
    expect(first).toContain(
      '<div id="feedback" class="feedback"><h3 class="landmark heading">Actions</h3><ul class="actions"><li><a href="#main">↑ Top</a></li><li class="chapter next">',
    );
    expect(first).not.toMatch(/afterword|<!--|role="(complementary|navigation)"/);

    expect(second).toContain(
      '<li class="chapter previous"><a href="https://archiveofourown.org/works/42/chapters/101">← Previous Chapter</a></li></ul>',
    );
    expect(second).not.toContain("Next Chapter");
    expect(second).toContain(
      '<div class="preface group"><h2 class="title heading">Backup Work</h2>',
    );
    expect(second).not.toContain("summary module");
    expect(second).toContain(
      '<h3 class="title"><a href="https://archiveofourown.org/works/42/chapters/102">Chapter 2</a></h3>',
    );
    expect(second).toContain(
      '<div class="afterword preface group"><div id="work_endnotes" class="end notes module">',
    );
    // The inspired works, afterword, #workskin, #work-skin and work all close before the feedback.
    expect(second).toContain('</ul></div></div></div></div></div><div id="feedback"');
  });

  it("leaves navigation and chapter wrappers out of a single-chapter work", async () => {
    const [page] = await pages(singleChapter);
    expect(page).toContain("<title>Backup &amp; Work</title>");
    expect(page).not.toMatch(/navigation actions|chapter preface|Next Chapter/);
    expect(page).toContain(
      '<div id="chapters" role="article"><h3 class="landmark heading" id="work">Work Text:</h3><div class="userstuff"><p>Only chapter</p></div></div>' +
        '<div class="afterword preface group"><div id="series" class="series module">',
    );
    // The afterword is on the same page.
    expect(page).toContain('<a href="#children">other works inspired by this one</a>');
  });
});

describe("GET /backup/:workId/offline", () => {
  const db = createDbConnection("postgresql://test:test@database.example/test");
  const get = vi.fn();
  const app = new Hono<{
    Variables: { user: { id: string }; db: typeof db; env: CloudflareBindings };
  }>()
    .use("*", async (c, next) => {
      c.set("user", { id: "reader" });
      c.set("db", db);
      c.set("env", { WORK_BACKUPS_BUCKET: { get } } as unknown as CloudflareBindings);
      await next();
    })
    .route("/backup", backupRouter);
  const ao3UpdatedAt = new Date("2026-10-01T12:00:00Z");

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isUserTrackingWork).mockResolvedValue(true);
    vi.mocked(findLatestActiveBackup).mockResolvedValue({
      workId: 42,
      format: "html",
      r2Key: "42/1759320000000.html",
      fileSize: multiChapter.length,
      ao3UpdatedAt,
      rowCreatedAt: ao3UpdatedAt,
    });
    get.mockImplementation(async () => new Response(multiChapter));
    vi.mocked(getWorkState).mockResolvedValue({
      title: "Backup Work",
      currentChapters: 2,
      totalChapters: null,
    });
    // AO3's chapter menu, which stored titles come from, shortens long titles.
    vi.mocked(findWorkChapters).mockResolvedValue([
      { id: 101, number: 1, title: "1. Beginning $&amp;..." },
      { id: 102, number: 2, title: null },
    ]);
  });

  it("returns the latest HTML backup as AO3 chapter pages with AO3's default skins", async () => {
    const response = await app.request("/backup/42/offline");
    expect(response.status).toBe(200);
    const body = await response.json<{
      skins: unknown[];
      chapters: { id: string; number: number; title: string; html: string }[];
    }>();
    expect(body).toMatchObject({
      workId: 42,
      title: "Backup Work",
      ao3UpdatedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(body.skins).toEqual(ao3DefaultSkin);
    // App releases that predate `skins` read the download's CSS and nest the full page in their own wrapper.
    expect(body).toMatchObject({
      styles: "#chapters { font-family: serif; }",
      preface: "",
      afterword: "",
    });
    expect(body.chapters.map(({ id, number, title }) => ({ id, number, title }))).toEqual([
      { id: "101", number: 1, title: "1. Beginning $&amp;..." },
      { id: "102", number: 2, title: "" },
    ]);
    // The page heading uses the download's full title.
    expect(body.chapters[0].html).toContain(
      '<a href="https://archiveofourown.org/works/42/chapters/101">Chapter 1</a>: Beginning $&amp; &lt;b&gt;</h3>',
    );
    expect(body.chapters[0].html).toContain(
      '<li class="chapter next"><a href="https://archiveofourown.org/works/42/chapters/102">Next Chapter →</a></li>',
    );
    expect(findLatestActiveBackup).toHaveBeenCalledWith(db, 42, "html");
    expect(get).toHaveBeenCalledWith("42/1759320000000.html");
  });

  it("omits chapters whose ID is unknown and uses chapter 0 for an unindexed single chapter", async () => {
    vi.mocked(findWorkChapters).mockResolvedValue([{ id: 102, number: 2, title: "Second" }]);
    let body = await (
      await app.request("/backup/42/offline")
    ).json<{ chapters: { id: string; html: string }[] }>();
    expect(body.chapters.map((chapter) => chapter.id)).toEqual(["102"]);
    expect(body.chapters[0].html).not.toContain("Previous Chapter");

    get.mockImplementation(async () => new Response(singleChapter));
    vi.mocked(findWorkChapters).mockResolvedValue([]);
    body = await (
      await app.request("/backup/42/offline")
    ).json<{ chapters: { id: string; html: string }[] }>();
    expect(body.chapters.map((chapter) => chapter.id)).toEqual(["0"]);
  });

  it("refuses works the reader does not track", async () => {
    vi.mocked(isUserTrackingWork).mockResolvedValue(false);
    expect((await app.request("/backup/42/offline")).status).toBe(403);
    expect(findLatestActiveBackup).not.toHaveBeenCalled();
  });

  it("reports a missing backup and an unusable file", async () => {
    vi.mocked(findLatestActiveBackup).mockResolvedValueOnce(null);
    expect((await app.request("/backup/42/offline")).status).toBe(404);

    get.mockImplementationOnce(async () => null);
    expect((await app.request("/backup/42/offline")).status).toBe(404);

    get.mockImplementationOnce(async () => new Response("<html><body>Log in</body></html>"));
    expect((await app.request("/backup/42/offline")).status).toBe(422);

    vi.mocked(findWorkChapters).mockResolvedValueOnce([]);
    expect((await app.request("/backup/42/offline")).status).toBe(422);
  });
});
