import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { AO3_BASE_URL, AO3_USER_AGENT } from "~/const";
import {
    type ParsedWork,
    parseChapterIndex,
    parseWorkPage,
    sParsedWork,
    sWorkChapterIndex,
    sWorkInfo,
    type WorkChapterIndex,
} from "~/lib/ao3-parser";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";

// ============================================================================
// Response Schemas - Derived from parser schemas
// Note: API response omits downloadPath/downloadUpdatedAt (internal fields)
// ============================================================================

const parsedWorkResponseSchema = sParsedWork
    .extend({
        workInfo: sWorkInfo.omit({
            downloadPath: true,
            downloadUpdatedAt: true,
        }),
    })
    .openapi({ description: "Parsed work data from AO3" });

const chapterIndexResponseSchema = sWorkChapterIndex.openapi({
    description: "Chapter index from AO3",
});

const parseWorkRoute = createRoute({
    method: "get",
    path: "/{workId}",
    tags: ["API/Parse"],
    summary: "Parse work metadata from AO3",
    description:
        "Fetches a work from AO3 and extracts metadata including title, author, stats, and tags",
    request: {
        params: z.object({
            workId: z.coerce.number().int().positive(),
        }),
        query: z.object({
            chapterId: z.coerce.number().int().positive().optional(),
        }),
    },
    responses: {
        200: {
            description: "Work parsed successfully",
            content: {
                "application/json": {
                    schema: parsedWorkResponseSchema,
                },
            },
        },
        401: {
            description: "Unauthorized",
        },
        502: {
            description: "Failed to fetch work from AO3",
        },
    },
});

const parseChapterIndexRoute = createRoute({
    method: "get",
    path: "/{workId}/chapters",
    tags: ["API/Parse"],
    summary: "Parse chapter index from AO3",
    description:
        "Fetches a work's chapter index (navigate page) from AO3 and extracts chapter information",
    request: {
        params: z.object({
            workId: z.coerce.number().int().positive(),
        }),
    },
    responses: {
        200: {
            description: "Chapter index parsed successfully",
            content: {
                "application/json": {
                    schema: chapterIndexResponseSchema,
                },
            },
        },
        401: {
            description: "Unauthorized",
        },
        502: {
            description: "Failed to fetch chapter index from AO3",
        },
    },
});

async function fetchWorkHtml(
    workId: number,
    chapterId?: number,
): Promise<string> {
    const url = chapterId
        ? `${AO3_BASE_URL}/works/${workId}/chapters/${chapterId}?view_adult=true`
        : `${AO3_BASE_URL}/works/${workId}?view_adult=true`;

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

    return response.text();
}

async function fetchChapterIndexHtml(workId: number): Promise<string> {
    const url = `${AO3_BASE_URL}/works/${workId}/navigate?view_adult=true`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": AO3_USER_AGENT,
        },
    });

    if (!response.ok) {
        throw new HTTPException(502, {
            message: `Failed to fetch chapter index from AO3: ${response.status} ${response.statusText}`,
        });
    }

    return response.text();
}

export const parseRouter = new OpenAPIHono<TRouterEnvAuthReq>()
    .openapi(parseWorkRoute, async (c) => {
        const { workId } = c.req.valid("param");
        const { chapterId } = c.req.valid("query");

        const html = await fetchWorkHtml(workId, chapterId);
        const parsed: ParsedWork = await parseWorkPage(html);

        return c.json(parsed, 200);
    })
    .openapi(parseChapterIndexRoute, async (c) => {
        const { workId } = c.req.valid("param");

        const html = await fetchChapterIndexHtml(workId);
        const parsed: WorkChapterIndex = await parseChapterIndex(html);

        return c.json(parsed, 200);
    });
