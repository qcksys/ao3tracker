import { eq } from "drizzle-orm";
import { afterAll, expect, inject, it } from "vitest";
import { createDbConnection } from "~/db/db.client";
import { tAppSetting } from "~/db/schema/app.setting";
import { tTrackWork } from "~/db/schema/track.work";
import { tWork } from "~/db/schema/work";
import { tWorkChapter } from "~/db/schema/work.chapter";
import { tWorkCheckerStatus } from "~/db/schema/work.checker.status";
import { tWorkTag } from "~/db/schema/work.tag";
import { tWorkTagLink } from "~/db/schema/work.tag.link";
import { chapterIndexHtml, workPageHtml } from "../ao3-parser.fixtures";

const db = createDbConnection(inject("databaseUrl"));
const checker = `${inject("apiUrl")}/checker`;
afterAll(() => db.$client.end());

it("claims tracked work, ingests AO3 metadata, leases one refresh and records failure and deletion", async () => {
  const workId = 10828137;
  const work = async () => (await db.select().from(tWork).where(eq(tWork.id, workId)))[0];
  const settings = {
    enabled: true,
    pollIntervalSeconds: 300,
    maxWorksPerPoll: 10,
    delayBetweenRequestsMs: 2000,
  };
  for (const table of [tTrackWork, tWorkTagLink, tWorkTag, tWorkChapter, tWork])
    await db.delete(table);
  await db
    .insert(tAppSetting)
    .values({ key: "work_checker", value: settings })
    .onConflictDoUpdate({ target: tAppSetting.key, set: { value: settings, rowDeletedAt: null } });
  await db
    .insert(tTrackWork)
    .values({ userId: "checker-reader", workId, subscribed: false, lastReadAt: new Date() });
  const post = (path: string, body?: object) =>
    fetch(checker + path, {
      method: "POST",
      headers: { authorization: "Bearer e2e-checker", "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
  const page = { outcome: "page", workId, workHtml: workPageHtml };
  expect(await (await post("/claim")).json()).toEqual({ jobs: [{ workId, kind: "missing" }] });
  expect(await (await post("/results", page)).json()).toEqual({ status: "needs_chapter_index" });
  expect(await (await post("/results", { ...page, chapterIndexHtml })).json()).toEqual({
    status: "applied",
    backups: [],
  });
  expect(await work()).toMatchObject({ currentChapters: 87, title: "XCOM: The Advent Directive" });
  expect(
    (await db.select().from(tWorkChapter).where(eq(tWorkChapter.workId, workId))).length,
  ).toBeGreaterThan(0);
  expect(
    (await db.select().from(tWorkTagLink).where(eq(tWorkTagLink.work, workId))).length,
  ).toBeGreaterThan(0);
  await db
    .update(tWork)
    .set({ lastRefreshed: new Date("2000-01-01") })
    .where(eq(tWork.id, workId));
  const audit = (await work()).rowUpdatedAt;
  const claims = await Promise.all([post("/claim"), post("/claim")]);
  const replies = await Promise.all(claims.map((r) => r.json()));
  expect(replies).toEqual(
    expect.arrayContaining([{ jobs: [{ workId, kind: "refresh" }] }, { jobs: [] }]),
  );
  expect((await work()).rowUpdatedAt).toEqual(audit);
  await post("/results", { workId, outcome: "failed", error: "Test failure" });
  expect(await work()).toMatchObject({ refreshFailures: 1, rowUpdatedAt: audit });
  const refresh = await (await post("/results", { ...page, chapterIndexHtml })).json();
  expect(refresh).toMatchObject({
    status: "applied",
    backups: expect.arrayContaining([
      expect.objectContaining({ format: "epub" }),
      expect.objectContaining({ format: "html" }),
    ]),
  });
  expect((await work()).refreshFailures).toBe(0);
  await post("/results", { workId, outcome: "not_found" });
  expect((await work()).rowDeletedAt).toBeInstanceOf(Date);
  const report = {
    checkerId: "e2e-checker",
    version: "e2e",
    startedAt: new Date().toISOString(),
    lastPoll: null,
    lastError: null,
  };
  expect((await post("/status", report)).status).toBe(204);
  expect(
    await db
      .select()
      .from(tWorkCheckerStatus)
      .where(eq(tWorkCheckerStatus.checkerId, report.checkerId)),
  ).toMatchObject([{ status: report }]);
});
