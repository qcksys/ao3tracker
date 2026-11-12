import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";
import {
  findActiveBackupByR2Key,
  findBackupsByWorkId,
  findLatestActiveBackup,
  upsertBackup,
} from "~/db/queries/backup";
import { isUserTrackingWork } from "~/db/queries/track";
import { findWorkChapters, getWorkState } from "~/db/queries/work";
import { type BackupFormat, backupFormats, sWorkBackupS } from "~/db/schema/work.backup";
import { ao3DefaultSkin } from "~/lib/ao3-skins";
import { backupChapterPage, readHtmlBackup } from "~/lib/html-backup";
import { enforceAo3ProxyLimit } from "~/middleware/rateLimitMw";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";

/** Allowed `{timestamp}.{format}` download filename (the r2Key after the workId prefix). */
const BACKUP_FILENAME_PATTERN = new RegExp(`^\\d+\\.(${backupFormats.join("|")})$`);

/** Content-Type served for each backup format on download. */
const BACKUP_CONTENT_TYPES: Record<BackupFormat, string> = {
  html: "text/html; charset=utf-8",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
  epub: "application/epub+zip",
  azw3: "application/vnd.amazon.ebook",
};

/** API datetime format helper */
const dateToIsoString = z.iso.datetime();

/** Backup request schema - derived from DB schema */
const backupRequestSchema = sWorkBackupS
  .pick({
    workId: true,
    format: true,
  })
  .extend({
    workId: z.coerce.number().int().positive(),
    workTitle: z.string().min(1),
    updatedAt: z.coerce
      .number()
      .int()
      .positive()
      .refine((val) => val <= Math.floor(Date.now() / 1000) + 86400, {
        message: "updatedAt cannot be more than 1 day in the future",
      })
      .optional(),
  })
  .openapi({ description: "Backup creation request" });

/** Backup response schema - derived from DB schema */
const backupResponseSchema = sWorkBackupS
  .pick({
    workId: true,
    format: true,
    r2Key: true,
    fileSize: true,
  })
  .extend({
    ao3UpdatedAt: dateToIsoString.nullable(),
    rowCreatedAt: dateToIsoString,
  })
  .openapi({ description: "Backup record" });

/**
 * List item shape: a backup record plus a relative, authenticated download
 * path. Replaces the previous public R2 bucket URL — downloads now stream
 * through the authenticated `GET /:workId/file/:filename` route.
 */
const backupListItemSchema = backupResponseSchema
  .extend({
    downloadPath: z.string(),
  })
  .openapi({ description: "Backup record with authenticated download path" });

const offlineBackupSchema = z
  .object({
    workId: z.number().int().positive(),
    title: z.string(),
    /** AO3 download revision of the backup */
    ao3UpdatedAt: dateToIsoString.nullable(),
    /** AO3's default site skin, then Reversi for dark mode; the reader's captured skin takes precedence */
    skins: z.array(z.object({ css: z.string(), media: z.string(), sourceUrl: z.string() })),
    /** Deprecated: the download's own CSS, for app releases that predate `skins` */
    styles: z.string(),
    /** Deprecated: empty, because each chapter page includes the work preface */
    preface: z.string(),
    /** Deprecated: empty, because each chapter page includes the work end notes */
    afterword: z.string(),
    chapters: z.array(
      z.object({
        /** AO3 chapter ID; "0" for a single-chapter work whose chapter ID is not stored */
        id: z.string(),
        number: z.number().int().positive(),
        title: z.string(),
        /** A complete chapter page in AO3's live markup */
        html: z.string(),
        missingResources: z.array(z.string()),
      }),
    ),
  })
  .openapi({ description: "Latest HTML backup split into chapters for offline reading" });

const createBackupRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["API/Backup"],
  summary: "Create a work backup",
  description: "Downloads a work from AO3 in the specified format and stores it in R2",
  request: {
    body: {
      content: {
        "application/json": {
          schema: backupRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Backup created successfully",
      content: {
        "application/json": {
          schema: backupResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
    },
    403: {
      description: "User is not tracking this work",
    },
    429: {
      description: "Rate limit exceeded",
    },
    502: {
      description: "Failed to fetch work from AO3",
    },
  },
});

const listBackupsRoute = createRoute({
  method: "get",
  path: "/:workId",
  tags: ["API/Backup"],
  summary: "List backups for a work",
  request: {
    params: z.object({
      workId: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: "List of backups",
      content: {
        "application/json": {
          schema: z.array(backupListItemSchema),
        },
      },
    },
    401: {
      description: "Unauthorized",
    },
    403: {
      description: "User is not tracking this work",
    },
  },
});

const offlineBackupRoute = createRoute({
  method: "get",
  path: "/:workId/offline",
  tags: ["API/Backup"],
  summary: "Get the latest HTML backup for offline reading",
  description:
    "Reads the newest HTML backup of a tracked work and rebuilds each chapter as a sanitized page in AO3's live chapter markup, labelled with stored AO3 chapter IDs, with AO3's default and Reversi skins. Chapters without a stored ID are omitted.",
  request: {
    params: z.object({
      workId: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: "Backup chapters",
      content: {
        "application/json": {
          schema: offlineBackupSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
    },
    403: {
      description: "User is not tracking this work",
    },
    404: {
      description: "No HTML backup is available",
    },
    422: {
      description: "The backup or the work's chapter list cannot be used",
    },
  },
});

export const backupRouter = new OpenAPIHono<TRouterEnvAuthReq>()
  .openapi(createBackupRoute, async (c) => {
    const { workId, workTitle, format, updatedAt } = c.req.valid("json");
    const userId = c.var.user.id;

    // Verify user is tracking this work
    const isTracking = await isUserTrackingWork(c.var.db, userId, workId);
    if (!isTracking) {
      throw new HTTPException(403, {
        message: "You must be tracking a work to create backups",
      });
    }

    await enforceAo3ProxyLimit(c);

    const fileContent = await fetchWorkFromAO3(workId, workTitle, format, updatedAt);

    const ao3UpdatedAt = updatedAt ? new Date(updatedAt * 1000) : null;
    const r2Key = buildR2Key(workId, format, ao3UpdatedAt);

    const backupSuccess = await c.var.env.WORK_BACKUPS_BUCKET.put(r2Key, fileContent);

    if (!backupSuccess) {
      throw new HTTPException(502, { message: "Failed to backup work" });
    }

    await upsertBackup(c.var.db, {
      workId,
      format,
      r2Key,
      fileSize: fileContent.byteLength,
      ao3UpdatedAt,
    });

    return c.json(
      {
        workId,
        format,
        r2Key,
        fileSize: fileContent.byteLength,
        ao3UpdatedAt: ao3UpdatedAt?.toISOString() ?? null,
        rowCreatedAt: new Date().toISOString(),
      },
      201,
    );
  })
  .openapi(listBackupsRoute, async (c) => {
    const { workId } = c.req.valid("param");
    const userId = c.var.user.id;

    // Verify user is tracking this work
    const isTracking = await isUserTrackingWork(c.var.db, userId, workId);
    if (!isTracking) {
      throw new HTTPException(403, {
        message: "You must be tracking a work to view backups",
      });
    }

    const backups = await findBackupsByWorkId(c.var.db, workId);

    return c.json(
      backups.map((b) => {
        // r2Key is `{workId}/{timestamp}.{format}`; the filename is the
        // segment after the workId prefix.
        const filename = b.r2Key.slice(`${b.workId}/`.length);
        return {
          workId: b.workId,
          format: b.format,
          r2Key: b.r2Key,
          fileSize: b.fileSize ?? null,
          ao3UpdatedAt: b.ao3UpdatedAt?.toISOString() ?? null,
          rowCreatedAt: b.rowCreatedAt.toISOString(),
          downloadPath: `/api/backup/${b.workId}/file/${filename}`,
        };
      }),
      200,
    );
  })
  .openapi(offlineBackupRoute, async (c) => {
    const { workId } = c.req.valid("param");

    const isTracking = await isUserTrackingWork(c.var.db, c.var.user.id, workId);
    if (!isTracking) {
      throw new HTTPException(403, {
        message: "You must be tracking a work to download backups",
      });
    }

    const backup = await findLatestActiveBackup(c.var.db, workId, "html");
    const object = backup ? await c.var.env.WORK_BACKUPS_BUCKET.get(backup.r2Key) : null;
    if (!backup || !object) {
      throw new HTTPException(404, { message: "No HTML backup is available for this work" });
    }

    const content = await readHtmlBackup(await object.text());
    if (!content) {
      throw new HTTPException(422, { message: "The HTML backup could not be read" });
    }

    const [work, storedChapters] = await Promise.all([
      getWorkState(c.var.db, workId),
      findWorkChapters(c.var.db, workId),
    ]);
    const byNumber = new Map(storedChapters.map((chapter) => [chapter.number, chapter]));
    const workUrl = `${AO3_BASE_URL}/works/${workId}`;
    const chapters = content.chapters.flatMap((chapter, index) => {
      const stored = byNumber.get(index + 1);
      const id = stored ? String(stored.id) : content.chapters.length === 1 ? "0" : null;
      if (id === null) return [];
      const url = id === "0" ? workUrl : `${workUrl}/chapters/${id}`;
      return [{ ...chapter, id, number: index + 1, title: stored?.title ?? "", url }];
    });
    if (chapters.length === 0) {
      throw new HTTPException(422, { message: "The work's chapter list is not available yet" });
    }

    const title = work?.title ?? `Work ${workId}`;
    return c.json(
      {
        workId,
        title,
        ao3UpdatedAt: backup.ao3UpdatedAt?.toISOString() ?? null,
        skins: ao3DefaultSkin,
        styles: content.downloadCss,
        preface: "",
        afterword: "",
        chapters: chapters.map((chapter, position) => ({
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          html: backupChapterPage(content, title, chapters, position),
          missingResources: chapter.images,
        })),
      },
      200,
    );
  })
  /**
   * Authenticated streaming download. Backups are a shared cache of public
   * AO3 works (keyed by workId), so access is gated on the caller tracking
   * the work; the raw R2 object is never exposed via a public bucket URL.
   */
  .get("/:workId/file/:filename", async (c) => {
    const workId = Number(c.req.param("workId"));
    const filename = c.req.param("filename");

    if (!Number.isInteger(workId) || workId <= 0) {
      throw new HTTPException(400, { message: "Invalid workId" });
    }
    if (!BACKUP_FILENAME_PATTERN.test(filename)) {
      throw new HTTPException(400, { message: "Invalid filename" });
    }

    const isTracking = await isUserTrackingWork(c.var.db, c.var.user.id, workId);
    if (!isTracking) {
      throw new HTTPException(403, {
        message: "You must be tracking a work to download backups",
      });
    }

    const r2Key = `${workId}/${filename}`;

    // Only serve backups with a live (non-deleted) row, so soft-deleted
    // backups hidden from the list aren't downloadable from R2 directly.
    const backup = await findActiveBackupByR2Key(c.var.db, r2Key);
    if (!backup) {
      throw new HTTPException(404, { message: "Backup not found" });
    }

    const object = await c.var.env.WORK_BACKUPS_BUCKET.get(r2Key);
    if (!object) {
      throw new HTTPException(404, { message: "Backup not found" });
    }

    const format = filename.split(".").pop() as BackupFormat;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", BACKUP_CONTENT_TYPES[format]);
    headers.set("Content-Disposition", `attachment; filename="${workId}.${format}"`);
    headers.set("Content-Length", object.size.toString());
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { status: 200, headers });
  });

async function fetchWorkFromAO3(
  workId: number,
  workTitle: string,
  format: BackupFormat,
  updatedAt?: number,
): Promise<ArrayBuffer> {
  const encodedTitle = encodeURIComponent(workTitle.replace(/ /g, "_"));
  const url = new URL(`${AO3_BASE_URL}/downloads/${workId}/${encodedTitle}.${format}`);

  if (updatedAt) {
    url.searchParams.set("updated_at", updatedAt.toString());
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": AO3_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new HTTPException(502, {
      message: `Failed to fetch work from AO3: ${response.status} ${response.statusText}`,
    });
  }

  return response.arrayBuffer();
}

function buildR2Key(workId: number, format: BackupFormat, ao3UpdatedAt: Date | null): string {
  const timestamp = ao3UpdatedAt ? ao3UpdatedAt.getTime() : Date.now();
  return `${workId}/${timestamp}.${format}`;
}
