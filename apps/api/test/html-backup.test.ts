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
const preface = `
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
      <dd>Part 2 of <a href="http://archiveofourown.org/series/9">Saga</a></dd>
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
    <p>Notes</p>
    <blockquote class="userstuff"><p>Work notes</p></blockquote>
    <div class="endnote-link">
      See the end of the work for <a href="#endnotes">more notes</a>
    </div>
  </div>
</div>`;
const endNotes = `
<div id="afterword">
  <h2 class="toc-heading">Afterword</h2>
  <div class="meta"><div id="endnotes"><p>End Notes</p><blockquote class="userstuff"><p>Thanks</p></blockquote></div></div>
  <p class="message">Please <a href="http://archiveofourown.org/works/42/comments/new">drop by the Archive and comment</a> to let the creator know if you enjoyed their work!</p>
</div>`;
const noEndNotes = `
<div id="afterword">
  <h2 class="toc-heading">Afterword</h2>
  <p class="message">Please <a href="https://archiveofourown.org/works/42/comments/new">drop by the Archive and comment</a> to let the creator know if you enjoyed their work!</p>
</div>`;
const document = (
  chapters: string,
  afterword = endNotes,
) => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>Backup Work - author - Fandom</title>
  <style type="text/css">#chapters { font-family: serif; }</style>
</head>
<body>
${preface}
<div id="chapters" class="userstuff">${chapters}</div>
${afterword}
</body>
</html>`;
const multiChapter = document(`
  <div class="meta group">
    <h2 class="heading">
      Chapter 1: Beginning
    </h2>
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
const singleChapter = document(
  `
  <h2 class="toc-heading">Backup Work</h2>
  <div class="userstuff"><p>Only chapter</p></div>
`,
  noEndNotes,
);

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
      '<dd class="series"><span class="series"><span class="position">Part 2 of <a href="https://archiveofourown.org/series/9">Saga</a></span></span></dd>',
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
    expect(notes).toMatch(/<div class="notes module">\s*<h3 class="heading">Notes:<\/h3>/);
    expect(notes).toContain(
      '<p class="jump">(See the end of the work for <a href="#work_endnotes">more notes</a>.)</p>',
    );
    expect(tags + heading + notes).not.toMatch(/toc-heading|Posted originally|http:|<!--/);
  });

  it("maps each chapter onto AO3's live chapter markup and removes what the reader must not run or fetch", async () => {
    const content = await read(multiChapter);
    expect(content.chapters).toHaveLength(2);
    const [first, second] = content.chapters;

    expect(first.html).toMatch(
      new RegExp(
        `^<div class="chapter preface group" role="complementary">\\s*${content.titleSlot}\\s*` +
          '<div id="summary" class="summary module"><h3 class="heading">Summary:</h3>',
      ),
    );
    expect(first.html).toMatch(
      /<div id="notes" class="notes module"><h3 class="heading">Notes:<\/h3>\s*<blockquote class="userstuff"><p>Notes<\/p><\/blockquote>\s*<p class="jump">\(See the end of the chapter for <a href="#chapter_1_endnotes">more notes<\/a>/,
    );
    expect(first.html).toContain(
      '<div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Chapter Text</h3>',
    );
    expect(first.html).toContain(
      '<div class="chapter preface group" role="complementary"><div class="end notes module" id="chapter_1_endnotes"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>Bye</p></blockquote></div></div>',
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
      new RegExp(
        `^<div class="chapter preface group" role="complementary">\\s*${content.titleSlot}\\s*</div>`,
      ),
    );
    expect(second.html).toContain("<p>Second </p>");
    expect(second.images).toEqual([]);

    expect(content.afterword).toContain(
      '<div id="work_endnotes" class="end notes module"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>Thanks</p></blockquote></div>',
    );
    expect(content.afterword).not.toMatch(/toc-heading|drop by the Archive/);
  });

  it("keeps a single-chapter work's text as one chapter without a chapter header", async () => {
    const content = await read(singleChapter);
    expect(content.afterword).toBe("");
    expect(content.chapters).toEqual([
      {
        html: '<div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Work Text:</h3><p>Only chapter</p></div>',
        // The preface is shown with the first chapter, so its images are reported there.
        images: ["https://archiveofourown.org/images/summary.png"],
      },
    ]);
  });

  it("rejects files that are not AO3 work downloads", async () => {
    expect(await readHtmlBackup("<html><body><p>Log in</p></body></html>")).toBeNull();
    expect(await readHtmlBackup(document(""))).toBeNull();
  });
});

describe("backupChapterPage", () => {
  const pages = async (html: string, titles: string[]) => {
    const content = await read(html);
    const chapters: BackupPageChapter[] = content.chapters.map((chapter, index) => ({
      number: index + 1,
      title: titles[index] ?? "",
      url: `https://archiveofourown.org/works/42/chapters/${101 + index}`,
      html: chapter.html,
    }));
    return chapters.map((_, position) =>
      backupChapterPage(content, "Backup &amp; Work", chapters, position),
    );
  };

  it("builds a complete AO3 chapter page with chapter navigation", async () => {
    // Stored titles keep the number prefix of AO3's chapter menu.
    const [first, second] = await pages(multiChapter, ["1. Beginning $& <b>", "2."]);
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
      '<div id="workskin"><div class="preface group"><h2 class="title heading">Backup Work</h2>',
    );
    expect(first).toContain('<div class="summary module">');
    expect(first).toContain(
      '<div id="chapters" role="article"><div class="chapter" id="chapter-1"><div class="chapter preface group" role="complementary">',
    );
    expect(first).toContain(
      '<h3 class="title"><a href="https://archiveofourown.org/works/42/chapters/101">Chapter 1</a>: Beginning $& &lt;b&gt;</h3>',
    );
    // The shared progress tracker completes a chapter when this button is visible.
    expect(first).toContain(
      '<div id="feedback" class="feedback"><h3 class="landmark heading">Actions</h3><ul class="actions" role="navigation"><li><a href="#main">↑ Top</a></li><li class="chapter next">',
    );
    expect(first).not.toMatch(/afterword|<!--/);

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
    expect(second).toContain('<div class="afterword preface group"><div id="work_endnotes"');
  });

  it("leaves navigation and chapter wrappers out of a single-chapter work", async () => {
    const [page] = await pages(singleChapter, []);
    expect(page).toContain("<title>Backup &amp; Work</title>");
    expect(page).not.toMatch(/navigation actions|chapter preface|Next Chapter/);
    expect(page).toContain(
      '<div id="chapters" role="article"><div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Work Text:</h3>',
    );
  });
});

describe("GET /backup/:workId/offline", () => {
  const db = createDbConnection("mysql://test:test@database.example/test");
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
    vi.mocked(findWorkChapters).mockResolvedValue([
      { id: 101, number: 1, title: "Beginning" },
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
      { id: "101", number: 1, title: "Beginning" },
      { id: "102", number: 2, title: "" },
    ]);
    expect(body.chapters[0].html).toContain(
      '<a href="https://archiveofourown.org/works/42/chapters/101">Chapter 1</a>: Beginning</h3>',
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
