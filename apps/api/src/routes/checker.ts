import {
  workCheckerBackupFormatSchema,
  workCheckerResultSchema,
} from "@qcksys/ao3tracker-core/work-checker";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "hono/utils/buffer";
import { createDbConnection } from "~/db/db.client";
import {
  applyWorkCheckerResult,
  claimWorkCheckerJobs,
  storeWorkCheckerBackup,
  workCheckerSettings,
} from "~/lib/work-checker";

type CheckerEnv = { Bindings: CloudflareBindings };

/** Work pages carry one chapter's text; long chapters reach a few megabytes */
const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

/**
 * Endpoints polled by the self-hosted browser work checker. Mounted before the session and
 * database middleware: the checker authenticates with the `WORK_CHECKER_TOKEN` bearer secret.
 */
export const checkerRouter = new Hono<CheckerEnv>();

checkerRouter.use(
  bearerAuth({
    verifyToken: async (token, c) => {
      const expected = (c.env as CloudflareBindings).WORK_CHECKER_TOKEN;
      return Boolean(expected) && (await timingSafeEqual(token, expected));
    },
  }),
);

checkerRouter.get("/settings", async (c) =>
  c.json(await workCheckerSettings(createDbConnection(c.env.DATABASE_URL))),
);

checkerRouter.post("/claim", async (c) => {
  const db = createDbConnection(c.env.DATABASE_URL);
  const settings = await workCheckerSettings(db);
  if (!settings.enabled) return c.json({ jobs: [] });
  return c.json({ jobs: await claimWorkCheckerJobs(db, settings.maxWorksPerPoll) });
});

checkerRouter.post("/results", bodyLimit({ maxSize: MAX_RESULT_BYTES }), async (c) => {
  const parsed = workCheckerResultSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid result" }, 400);
  const db = createDbConnection(c.env.DATABASE_URL);
  return c.json(await applyWorkCheckerResult(db, c.env, parsed.data));
});

checkerRouter.put(
  "/backups/:workId/:format",
  bodyLimit({ maxSize: MAX_BACKUP_BYTES }),
  async (c) => {
    const workId = Number(c.req.param("workId"));
    const format = workCheckerBackupFormatSchema.safeParse(c.req.param("format"));
    const downloadUpdatedAt = Number(c.req.query("downloadUpdatedAt"));
    if (
      !Number.isSafeInteger(workId) ||
      workId <= 0 ||
      !format.success ||
      !Number.isSafeInteger(downloadUpdatedAt)
    ) {
      return c.json({ error: "Invalid backup" }, 400);
    }
    const fileContent = await c.req.arrayBuffer();
    if (fileContent.byteLength === 0) return c.json({ error: "Empty backup" }, 400);

    const db = createDbConnection(c.env.DATABASE_URL);
    const outcome = await storeWorkCheckerBackup(
      db,
      c.env,
      workId,
      format.data,
      downloadUpdatedAt,
      fileContent,
    );
    return c.json({ outcome }, outcome === "superseded" ? 409 : 200);
  },
);

checkerRouter.all("*", (c) => c.body(null, 404));
