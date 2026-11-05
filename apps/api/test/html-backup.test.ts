import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { findLatestActiveBackup } from "~/db/queries/backup";
import { isUserTrackingWork } from "~/db/queries/track";
import { findWorkChapters, getWorkState } from "~/db/queries/work";
import { readHtmlBackup } from "~/lib/html-backup";
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
    <dl class="tags"><dt>Fandom:</dt><dd><a href="http://archiveofourown.org/tags/Fandom%20(Video%20Game)">Fandom</a></dd></dl>
    <h1>Backup Work</h1>
    <div class="byline">by <a rel="author" href="http://archiveofourown.org/users/author/pseuds/author">author</a></div>
    <p>Summary</p>
    <blockquote class="userstuff"><p>Work summary <img src="/images/summary.png"></p></blockquote>
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
    <p>Chapter Notes</p>
    <blockquote class="userstuff"><p>Notes</p></blockquote>
    <div class="endnote-link">See the end of the chapter for <a href="#endnotes1">more notes</a></div>
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

describe("readHtmlBackup", () => {
  it("splits chapters and removes markup the offline reader must not run or fetch", async () => {
    const content = await readHtmlBackup(multiChapter);
    expect(content).not.toBeNull();
    if (!content) return;
    expect(content.styles).toBe("#chapters { font-family: serif; }");
    expect(content.chapters).toHaveLength(2);

    const [first, second] = content.chapters;
    expect(first.html).toMatch(/<h2 class="heading">\s*Chapter 1: Beginning\s*<\/h2>/);
    expect(first.html).toContain('<a href="#endnotes1">');
    expect(first.html).toContain('id="endnotes1"');
    expect(first.html).toContain('<a href="https://archiveofourown.org/works/7">relative</a>');
    expect(first.html).toContain("<a>bad</a>");
    expect(first.html).not.toMatch(/onclick|<script|steal\(\)|<!--|src=/);
    expect(first.html).toContain('<img alt="Map">');
    expect(first.html).toContain('<img alt="Image unavailable offline">');
    expect(first.html).not.toContain("Chapter 2");
    expect(first.images).toEqual([
      "https://archiveofourown.org/images/summary.png",
      "https://example.com/one.png",
    ]);

    expect(second.html).toMatch(/<h2 class="heading">\s*Chapter 2\s*<\/h2>/);
    expect(second.html).toContain("<p>Second </p>");
    expect(second.images).toEqual([]);

    expect(content.preface).toContain("<h1>Backup Work</h1>");
    // The offline reader follows only https AO3 links.
    expect(content.preface).toContain(
      'href="https://archiveofourown.org/tags/Fandom%20(Video%20Game)"',
    );
    expect(content.preface).toContain(
      'href="https://archiveofourown.org/users/author/pseuds/author"',
    );
    expect(content.preface).not.toMatch(/toc-heading|Posted originally|http:/);
    expect(content.afterword).toContain('<div id="endnotes">');
    expect(content.afterword).not.toMatch(/toc-heading|drop by the Archive/);
  });

  it("returns a single-chapter work's text as one chapter without its contents heading", async () => {
    const content = await readHtmlBackup(singleChapter);
    expect(content?.afterword).toBe("");
    expect(content?.chapters).toEqual([
      {
        html: '<div class="userstuff"><p>Only chapter</p></div>',
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

  it("labels the latest HTML backup's chapters with stored chapter IDs", async () => {
    const response = await app.request("/backup/42/offline");
    expect(response.status).toBe(200);
    const body = await response.json<{ chapters: Record<string, unknown>[] }>();
    expect(body).toMatchObject({
      workId: 42,
      title: "Backup Work",
      ao3UpdatedAt: "2026-10-01T12:00:00.000Z",
      styles: "#chapters { font-family: serif; }",
    });
    expect(body.chapters.map(({ id, number, title }) => ({ id, number, title }))).toEqual([
      { id: "101", number: 1, title: "Beginning" },
      { id: "102", number: 2, title: "" },
    ]);
    expect(findLatestActiveBackup).toHaveBeenCalledWith(db, 42, "html");
    expect(get).toHaveBeenCalledWith("42/1759320000000.html");
  });

  it("omits chapters whose ID is unknown and uses chapter 0 for an unindexed single chapter", async () => {
    vi.mocked(findWorkChapters).mockResolvedValue([{ id: 102, number: 2, title: "Second" }]);
    let body = await (
      await app.request("/backup/42/offline")
    ).json<{ chapters: { id: string }[] }>();
    expect(body.chapters.map((chapter) => chapter.id)).toEqual(["102"]);

    get.mockImplementation(async () => new Response(singleChapter));
    vi.mocked(findWorkChapters).mockResolvedValue([]);
    body = await (await app.request("/backup/42/offline")).json<{ chapters: { id: string }[] }>();
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
