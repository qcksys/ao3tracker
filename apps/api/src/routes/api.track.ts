import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  batchProcessChapters,
  batchProcessWorks,
  DEFAULT_SYNC_LIMIT,
  getLatestWorkLastReadAt,
  getServerLastUpdated,
  getTrackedWorksForSync,
} from "~/db/queries/track";
import { batchUpsertFavouriteTags, getFavouriteTagsSince } from "~/db/queries/user-favourite-tag";
import { batchUpsertSavedSearches, getSavedSearchesSince } from "~/db/queries/user-saved-search";
import { sTrackChapterI, sTrackChapterS } from "~/db/schema/track.chapter";
import { sTrackWorkI, sTrackWorkS } from "~/db/schema/track.work";
import { sWorkS } from "~/db/schema/work";
import { sWorkChapterS } from "~/db/schema/work.chapter";
import { sWorkTagS, type TTagTypeId, tagTypes } from "~/db/schema/work.tag";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";

// ============================================================================
// API Schema Helpers
// Note: DB schemas use z.date() but API uses ISO 8601 strings for JSON
// These schemas extend DB schemas with datetime string overrides
// ============================================================================

/** Convert date fields to ISO string format for API responses */
const dateToIsoString = z.iso.datetime();

// ============================================================================
// Response Schemas - Derived from DB select schemas
// ============================================================================

/** Work tracking response - extends sTrackWorkS with API-specific fields */
const trackWorkResponseSchema = sTrackWorkS
  .pick({
    workId: true,
    private: true,
    subscribed: true,
    favourite: true,
  })
  .extend({
    lastReadAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp when the work was last read",
      example: "2025-11-30T12:00:00.000Z",
    }),
    markedCompleteAt: dateToIsoString.nullable().openapi({
      description: "ISO 8601 timestamp when marked complete, or null if not completed",
      example: null,
    }),
    subscribedUpdatedAt: dateToIsoString.nullable().openapi({
      description:
        "ISO 8601 timestamp when subscribed was last changed, or null if using lastReadAt",
      example: "2025-11-30T12:00:00.000Z",
    }),
    favouriteUpdatedAt: dateToIsoString.nullable().openapi({
      description:
        "ISO 8601 timestamp when favourite was last changed, or null if using lastReadAt",
      example: "2025-11-30T12:00:00.000Z",
    }),
    deleted: z.boolean().openapi({
      description: "Whether the work has been untracked",
      example: false,
    }),
  })
  .openapi({ description: "Work tracking data from server" });

/** Chapter tracking response - extends sTrackChapterS with API-specific fields */
const trackChapterResponseSchema = sTrackChapterS
  .pick({
    workId: true,
    chapterId: true,
    readProgress: true,
  })
  .extend({
    lastReadAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp when the chapter was last read",
      example: "2025-11-30T12:00:00.000Z",
    }),
    markedCompleteAt: dateToIsoString.nullable().openapi({
      description: "ISO 8601 timestamp when marked complete, or null if not completed",
      example: null,
    }),
    deleted: z.boolean().openapi({
      description: "Whether the chapter tracking has been deleted",
      example: false,
    }),
  })
  .openapi({ description: "Chapter tracking data from server" });

/** Work metadata response - extends sWorkS, omits audit fields */
const workMetadataSchema = sWorkS
  .pick({
    id: true,
    title: true,
    author: true,
    authorUrl: true,
    summary: true,
    language: true,
    wordCount: true,
    currentChapters: true,
    totalChapters: true,
    hits: true,
    kudos: true,
    bookmarks: true,
    comments: true,
    downloadPath: true,
  })
  .extend({
    published: dateToIsoString.openapi({
      description: "Published date (ISO 8601)",
    }),
    lastUpdated: dateToIsoString.openapi({
      description: "Last updated date (ISO 8601)",
    }),
    downloadUpdatedAt: dateToIsoString.nullable().openapi({
      description: "Download updated timestamp (ISO 8601)",
    }),
  })
  .openapi({ description: "Work metadata from server" });

/** Chapter metadata response - extends sWorkChapterS */
const chapterMetadataSchema = sWorkChapterS
  .pick({
    id: true,
    workId: true,
    number: true,
    title: true,
  })
  .extend({
    dateUpdated: dateToIsoString.nullable().openapi({
      description: "Chapter date (ISO 8601)",
    }),
  })
  .openapi({ description: "Chapter metadata from server" });

/** Tag type enum for API responses */
const tagTypeSchema = z
  .enum([
    "unknown",
    "rating",
    "warning",
    "category",
    "fandom",
    "relationship",
    "character",
    "freeform",
  ])
  .openapi({ description: "Tag type" });

/** Tag metadata response - derived from work tag schema */
const tagMetadataSchema = sWorkTagS
  .pick({
    tag: true,
    href: true,
  })
  .extend({
    workId: z.number().int().positive().openapi({
      description: "Work ID this tag belongs to",
      example: 12345678,
    }),
    type: tagTypeSchema.openapi({
      description: "Tag type (rating, warning, category, fandom, etc.)",
      example: "freeform",
    }),
  })
  .openapi({ description: "Tag metadata from server" });

// ============================================================================
// Input Schemas - Derived from DB insert schemas
// ============================================================================

/** Work tracking input - extends sTrackWorkI with API-specific fields */
const trackWorkInputSchema = sTrackWorkI
  .pick({
    workId: true,
    private: true,
    subscribed: true,
    favourite: true,
  })
  .extend({
    workId: z.number().int().positive().openapi({
      description: "AO3 work ID",
      example: 12345678,
    }),
    lastReadAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp when the work was last read",
      example: "2025-11-30T12:00:00.000Z",
    }),
    markedCompleteAt: dateToIsoString.nullish().openapi({
      description: "ISO 8601 timestamp when marked complete, or null/omitted if not complete",
      example: null,
    }),
    private: z.boolean().default(false).openapi({
      description: "Whether the work requires AO3 login to read (restricted work)",
      example: false,
    }),
    subscribed: z.boolean().default(true).openapi({
      description: "Whether to receive notifications for new chapters",
      example: true,
    }),
    favourite: z.boolean().default(false).openapi({
      description: "Whether the work is marked as a favourite",
      example: false,
    }),
    subscribedUpdatedAt: dateToIsoString.nullish().openapi({
      description:
        "ISO 8601 timestamp when subscribed was last changed. If omitted, uses lastReadAt.",
      example: "2025-11-30T12:00:00.000Z",
    }),
    favouriteUpdatedAt: dateToIsoString.nullish().openapi({
      description:
        "ISO 8601 timestamp when favourite was last changed. If omitted, uses lastReadAt.",
      example: "2025-11-30T12:00:00.000Z",
    }),
    deleted: z.boolean().default(false).openapi({
      description: "Whether to untrack this work",
      example: false,
    }),
  });

/** Chapter tracking input - extends sTrackChapterI with API-specific fields */
const trackChapterInputSchema = sTrackChapterI
  .pick({
    workId: true,
    chapterId: true,
    readProgress: true,
  })
  .extend({
    workId: z.number().int().positive().openapi({
      description: "AO3 work ID",
      example: 12345678,
    }),
    chapterId: z.number().int().nonnegative().openapi({
      description: "AO3 chapter ID, or 0 for single-chapter works",
      example: 98765432,
    }),
    lastReadAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp when the chapter was last read",
      example: "2025-11-30T12:00:00.000Z",
    }),
    markedCompleteAt: dateToIsoString.nullish().openapi({
      description: "ISO 8601 timestamp when marked complete, or null/omitted if not complete",
      example: null,
    }),
    readProgress: z.number().min(0).max(1).openapi({
      description: "Reading progress from 0 (unread) to 1 (complete)",
      example: 0.75,
    }),
    deleted: z.boolean().optional().default(false).openapi({
      description: "Soft-delete this chapter using lastReadAt as the deletion timestamp",
    }),
  });

/** Valid tag type IDs (matches `tagTypes` values) */
const tagTypeIdSchema = z
  .number()
  .int()
  .refine((n): n is TTagTypeId => Object.values(tagTypes).includes(n as TTagTypeId), {
    message: "Unknown tagType id",
  })
  .openapi({
    description: "Tag type ID (0=unknown, 1=rating, ... 7=freeform)",
    example: 7,
  });

/** Favourite-tag wire row — used in both GET response and POST request/response */
const favouriteTagItemSchema = z
  .object({
    tagType: tagTypeIdSchema,
    tag: z.string().min(1).max(191).openapi({
      description: "Tag string as it appears on AO3",
      example: "Fluff",
    }),
    favourited: z.boolean().openapi({
      description: "true = pinned/favourited; false = tombstone (was favourited but unpinned)",
    }),
    updatedAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp of the last add/remove. Used for LWW.",
    }),
  })
  .openapi({ description: "Favourite-tag entry for sync" });

/** Saved-search wire row — used in both GET response and POST request/response */
const savedSearchItemSchema = z
  .object({
    id: z.uuid().openapi({
      description: "Client-generated uuid identifying the saved search",
      example: "8f1c3a2e-9b4d-4e6a-bf12-3c0d5e7a9b10",
    }),
    name: z.string().min(1).max(191).openapi({
      description: "User-given name for the saved search",
      example: "Long Steve/Bucky fics",
    }),
    url: z.string().min(1).max(8192).openapi({
      description: "Full AO3 filter/search URL the search points at",
      example:
        "https://archiveofourown.org/tags/Captain%20America/works?work_search%5Bsort_column%5D=kudos_count",
    }),
    deleted: z.boolean().openapi({
      description: "false = active; true = tombstone (deleted, kept so other devices converge)",
    }),
    updatedAt: dateToIsoString.openapi({
      description: "ISO 8601 timestamp of the last save/edit/delete. Used for LWW.",
    }),
  })
  .openapi({ description: "Saved-search entry for sync" });

// ============================================================================
// GET /sync - Fetch server data
// ============================================================================

// Filter schemas - discriminated union for extensibility
const workIdsFilterSchema = z.object({
  type: z.literal("workIds").openapi({
    description: "Filter type: filter by specific work IDs",
  }),
  workIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(50)
    .openapi({
      description: "Array of work IDs to filter by (1-50 IDs)",
      example: [12345678, 23456789],
    }),
});

// Union of all filter types - extend this as new filter types are added
const syncFilterSchema = z.discriminatedUnion("type", [workIdsFilterSchema]).openapi({
  description: "Filter to apply to sync results. Currently supports filtering by work IDs.",
});

export type SyncFilter = z.infer<typeof syncFilterSchema>;

const getSyncQuerySchema = z.object({
  lastSyncedAt: dateToIsoString.optional().openapi({
    description: "ISO 8601 timestamp of last sync. Omit for full sync.",
    example: "2025-11-30T12:00:00.000Z",
  }),
  workCursor: z.coerce.number().int().positive().optional().openapi({
    description: "Cursor for paginating works. Use nextWorkCursor from previous response.",
    example: 12345678,
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DEFAULT_SYNC_LIMIT)
    .optional()
    .openapi({
      description: `Max works to return per page. Default: ${DEFAULT_SYNC_LIMIT}, Max: ${DEFAULT_SYNC_LIMIT}`,
      example: DEFAULT_SYNC_LIMIT,
    }),
  filter: z
    .preprocess((val) => (typeof val === "string" ? JSON.parse(val) : val), syncFilterSchema)
    .optional()
    .openapi({
      description: 'JSON-encoded filter object. Example: {"type":"workIds","workIds":[12345678]}',
      example: '{"type":"workIds","workIds":[12345678]}',
    }),
});

const getSyncResponseSchema = z.object({
  works: z.array(trackWorkResponseSchema).openapi({
    description: "List of tracked works from server",
  }),
  chapters: z.array(trackChapterResponseSchema).openapi({
    description:
      "List of tracked chapters for the works in this response (all chapters, no pagination)",
  }),
  workMetadata: z.array(workMetadataSchema).openapi({
    description:
      "Metadata for tracked works (title, author, stats, etc.). Empty for private works.",
  }),
  chapterMetadata: z.array(chapterMetadataSchema).openapi({
    description: "Metadata for chapters of tracked works",
  }),
  tagMetadata: z.array(tagMetadataSchema).openapi({
    description: "Tags for tracked works (tag name, type, URL)",
  }),
  nextWorkCursor: z.number().nullable().openapi({
    description: "Cursor for next page of works, or null if no more pages",
    example: 12345678,
  }),
  hasMore: z.boolean().openapi({
    description: "True if there are more works to fetch",
    example: false,
  }),
  serverLastUpdated: dateToIsoString.openapi({
    description:
      "Database watermark captured before this page was read, with a 16-minute replay window for writes awaiting commit. Save the first page's value as lastSyncedAt after all pages succeed; never use it to filter uploads.",
    example: "2025-11-30T12:00:00.000Z",
  }),
  latestWorkLastReadAt: dateToIsoString.nullable().openapi({
    description:
      "ISO 8601 timestamp of most recent work lastReadAt, or null if user has no tracked works. Informational only; upload all pending local changes.",
    example: "2025-11-30T12:00:00.000Z",
  }),
  favouriteTags: z.array(favouriteTagItemSchema).optional().openapi({
    description:
      "Favourite tag filter entries updated since `lastSyncedAt`, or all entries when omitted. Full and incremental sync include tombstones (`favourited=false`) so existing clients converge after a cursor reset.",
  }),
  savedSearches: z.array(savedSearchItemSchema).optional().openapi({
    description:
      "Saved-search entries updated since `lastSyncedAt`, or all entries when omitted. Full and incremental sync include tombstones (`deleted=true`) so existing clients converge after a cursor reset.",
  }),
});

const getSyncRoute = createRoute({
  method: "get",
  path: "/sync",
  tags: ["API/Track"],
  summary: "Fetch server tracking data (Step 1 of sync)",
  description: `Fetches the server's tracking data for the authenticated user. This is the first step of the sync process.

**Sync Flow:**
1. \`GET /sync?lastSyncedAt={timestamp}\` - Fetch all server changes since last sync
2. Continue fetching with cursors until \`hasMore\` is false
3. Save \`serverLastUpdated\` from the first page after every page succeeds
4. \`POST /sync\` - Send all pending local changes, including older offline events

**Filtering:**
Use the \`filter\` query parameter to sync only specific works:
- \`filter={"type":"workIds","workIds":[123,456]}\` - Sync only specific work IDs (max 50)

When filtering, the response only includes works matching the filter criteria.

**Pagination:**
- Pagination is only on works (default: ${DEFAULT_SYNC_LIMIT}, max: ${DEFAULT_SYNC_LIMIT})
- All chapters for returned works are included (no chapter pagination)
- Use \`nextWorkCursor\` from response for next page
- Continue fetching while \`hasMore\` is true

**Response includes:**
- Work tracking data (includes \`subscribedUpdatedAt\` and \`favouriteUpdatedAt\` for LWW sync)
- Chapter tracking data
- Work metadata (title, author, stats including kudos)
- Chapter metadata (titles, dates)
- Tag metadata (tag name, type, URL for each work)

**Full Sync Example:**
\`\`\`
GET /sync
→ Returns first page of works with all their chapters, hasMore: true

GET /sync?workCursor=12345
→ Returns next page, hasMore: false

POST /sync
← Send all pending local works/chapters
\`\`\`

**Filtered Sync Example:**
\`\`\`
GET /sync?filter={"type":"workIds","workIds":[12345678]}
→ Returns only the specified work(s) with their chapters
\`\`\``,
  request: {
    query: getSyncQuerySchema,
  },
  responses: {
    200: {
      description: "Server tracking data retrieved successfully",
      content: {
        "application/json": {
          schema: getSyncResponseSchema,
        },
      },
    },
    401: { description: "Unauthorized" },
  },
});

// ============================================================================
// POST /sync - Send client data
// ============================================================================

const postSyncRequestSchema = z
  .object({
    works: z.array(trackWorkInputSchema).max(50).optional().openapi({
      description: "Works to sync (max 50 per request)",
    }),
    chapters: z.array(trackChapterInputSchema).optional().openapi({
      description: "Chapters to sync (must reference works in this request)",
    }),
    favouriteTags: z.array(favouriteTagItemSchema).max(500).optional().openapi({
      description:
        "Favourite tag filter changes to push. Each row is LWW-merged independently using its `updatedAt`. Tombstones (favourited=false) are accepted.",
    }),
    savedSearches: z.array(savedSearchItemSchema).max(500).optional().openapi({
      description:
        "Saved-search changes to push. Each row is LWW-merged independently using its `updatedAt`. Tombstones (deleted=true) are accepted.",
    }),
  })
  .refine(
    (data) => {
      if (!data.chapters || data.chapters.length === 0) return true;
      if (!data.works || data.works.length === 0) return false;
      const workIds = new Set(data.works.map((w) => w.workId));
      return data.chapters.every((ch) => workIds.has(ch.workId));
    },
    {
      message: "All chapters must reference a work included in the same request",
      path: ["chapters"],
    },
  );

const syncItemStatus = z.enum(["accepted", "ignored", "deleted"]).openapi({
  description:
    "Sync result: accepted (updated), ignored (server has newer), deleted (soft deleted)",
});

const workSyncResultSchema = z.object({
  workId: z.number(),
  status: syncItemStatus,
});

const chapterSyncResultSchema = z.object({
  workId: z.number(),
  chapterId: z.number(),
  status: syncItemStatus,
});

const favouriteTagSyncResultSchema = z.object({
  tagType: tagTypeIdSchema,
  tag: z.string(),
  status: z.enum(["accepted", "ignored"]).openapi({
    description: "Sync result: accepted (LWW chose client) or ignored (server has equal-or-newer)",
  }),
});

const savedSearchSyncResultSchema = z.object({
  id: z.uuid(),
  status: z.enum(["accepted", "ignored"]).openapi({
    description: "Sync result: accepted (LWW chose client) or ignored (server has equal-or-newer)",
  }),
});

const postSyncResponseSchema = z.object({
  works: z.array(workSyncResultSchema).openapi({
    description: "Sync status for each submitted work",
  }),
  chapters: z.array(chapterSyncResultSchema).openapi({
    description: "Sync status for each submitted chapter",
  }),
  favouriteTags: z.array(favouriteTagSyncResultSchema).optional().openapi({
    description:
      "Sync status for each submitted favourite-tag row. Omitted if no favouriteTags were sent.",
  }),
  savedSearches: z.array(savedSearchSyncResultSchema).optional().openapi({
    description:
      "Sync status for each submitted saved-search row. Omitted if no savedSearches were sent.",
  }),
  syncedAt: dateToIsoString.openapi({
    description:
      "ISO 8601 timestamp when the upload completed. Informational only; retain the first GET page's serverLastUpdated for the next pull.",
    example: "2025-11-30T12:00:00.000Z",
  }),
});

const postSyncRoute = createRoute({
  method: "post",
  path: "/sync",
  tags: ["API/Track"],
  summary: "Send client tracking data (Step 2 of sync)",
  description: `Sends the client's tracking data to the server. This is the second step of the sync process.

**Important:**
- Send all pending local changes; server conflict resolution handles older offline events
- Max 50 works per request
- All chapters must reference a work in the same request

**Per-Field Conflict Resolution (LWW):**
Uses Last-Write-Wins (LWW) independently for each field.

| Field | Compared Using | Notes |
|-------|----------------|-------|
| \`lastReadAt\`, \`markedCompleteAt\`, \`private\` | \`lastReadAt\` | Reading progress fields |
| \`subscribed\` | \`subscribedUpdatedAt\` | Explicit timestamp for this field |
| \`favourite\` | \`favouriteUpdatedAt\` | Explicit timestamp for this field |

**Resolution rules:**
1. If only one side has an explicit timestamp, that side wins
2. If both have timestamps, compare them (server wins on tie)
3. If neither has a timestamp, compare \`lastReadAt\` (server wins on tie)

This enables multi-device sync where toggling \`favourite\` on Device A won't be overwritten
when Device B syncs reading progress, as long as Device A provides \`favouriteUpdatedAt\`.

**Sync Status:**
- \`accepted\`: At least one submitted field group and its timestamp match persisted state (including an idempotent retry)
- \`ignored\`: Server has newer data for all fields
- \`deleted\`: Work was soft deleted

**Soft Delete:**
- Set \`deleted: true\` on a work to untrack it
- Deletion syncs to other devices

**Example with per-field timestamps:**
\`\`\`json
{
  "works": [
    {
      "workId": 12345678,
      "lastReadAt": "2025-11-30T11:00:00.000Z",
      "subscribed": true,
      "subscribedUpdatedAt": "2025-11-30T12:00:00.000Z",
      "favourite": true,
      "favouriteUpdatedAt": "2025-11-30T12:30:00.000Z"
    }
  ]
}
\`\`\`
In this example, \`favourite\` and \`subscribed\` have their own timestamps, allowing them to sync
independently from reading progress (\`lastReadAt\`).`,
  request: {
    body: {
      content: {
        "application/json": {
          schema: postSyncRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Sync completed successfully",
      content: {
        "application/json": {
          schema: postSyncResponseSchema,
        },
      },
    },
    401: { description: "Unauthorized" },
    400: {
      description: "Validation error (chapters reference missing works)",
    },
  },
});

// ============================================================================
// Router
// ============================================================================

// Map tag type ID to string name
const tagTypeIdToName = Object.fromEntries(
  Object.entries(tagTypes).map(([name, id]) => [id, name]),
) as Record<number, keyof typeof tagTypes>;

const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const trackRouter = new OpenAPIHono<TRouterEnvAuthReq>()
  .openapi(getSyncRoute, async (c) => {
    const user = c.var.user;
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const userId = user.id;
    const { lastSyncedAt, workCursor, limit, filter } = c.req.valid("query");

    console.log({
      message: "GET /sync request",
      userId,
      lastSyncedAt: lastSyncedAt ?? null,
      workCursor: workCursor ?? null,
      limit: limit ?? null,
      filter: filter ?? null,
    });

    const serverLastUpdated = await getServerLastUpdated(c.var.db);
    const since = lastSyncedAt
      ? new Date(lastSyncedAt) > serverLastUpdated
        ? new Date(0)
        : new Date(lastSyncedAt)
      : undefined;
    const actualLimit = limit ?? DEFAULT_SYNC_LIMIT;

    // Only return favouriteTags on the first page of a sync run (workCursor not
    // set). Subsequent paginated pages don't need to re-send the same set.
    const includeFavouriteTags = workCursor === undefined;

    const [
      latestWorkLastReadAt,
      favouriteTags,
      savedSearches,
      { works, chapters, workMetadata, chapterMetadata, tagMetadata, hasMoreWorks },
    ] = await Promise.all([
      getLatestWorkLastReadAt(c.var.db, userId),
      includeFavouriteTags
        ? getFavouriteTagsSince(c.var.db, userId, since ?? null)
        : Promise.resolve([]),
      includeFavouriteTags
        ? getSavedSearchesSince(c.var.db, userId, since ?? null)
        : Promise.resolve([]),
      getTrackedWorksForSync(c.var.db, userId, {
        since,
        workCursor,
        limit: actualLimit,
        filter,
      }),
    ]);

    // Calculate next cursor
    const nextWorkCursor = hasMoreWorks && works.length > 0 ? works[works.length - 1].workId : null;

    console.log({
      message: "GET /sync response",
      userId,
      worksCount: works.length,
      chaptersCount: chapters.length,
      workMetadataCount: workMetadata.length,
      chapterMetadataCount: chapterMetadata.length,
      tagMetadataCount: tagMetadata.length,
      favouriteTagsCount: favouriteTags.length,
      savedSearchesCount: savedSearches.length,
      hasMore: hasMoreWorks,
      nextWorkCursor,
    });

    return c.json({
      works: works.map((w) => ({
        workId: w.workId,
        lastReadAt: w.lastReadAt.toISOString(),
        markedCompleteAt: isoOrNull(w.markedCompleteAt),
        private: w.private,
        subscribed: w.subscribed,
        favourite: w.favourite,
        subscribedUpdatedAt: isoOrNull(w.subscribedUpdatedAt),
        favouriteUpdatedAt: isoOrNull(w.favouriteUpdatedAt),
        deleted: w.rowDeletedAt !== null,
      })),
      chapters: chapters.map((ch) => ({
        workId: ch.workId,
        chapterId: ch.chapterId,
        lastReadAt: ch.lastReadAt.toISOString(),
        markedCompleteAt: isoOrNull(ch.markedCompleteAt),
        readProgress: ch.readProgress,
        deleted: ch.rowDeletedAt !== null,
      })),
      workMetadata: workMetadata.map((w) => ({
        id: w.id,
        title: w.title,
        author: w.author,
        authorUrl: w.authorUrl,
        summary: w.summary,
        language: w.language,
        wordCount: w.wordCount,
        currentChapters: w.currentChapters,
        totalChapters: w.totalChapters,
        hits: w.hits,
        kudos: w.kudos,
        bookmarks: w.bookmarks,
        comments: w.comments,
        published: w.published.toISOString(),
        lastUpdated: w.lastUpdated.toISOString(),
        downloadPath: w.downloadPath,
        downloadUpdatedAt: isoOrNull(w.downloadUpdatedAt),
      })),
      chapterMetadata: chapterMetadata.map((ch) => ({
        id: ch.id,
        workId: ch.workId,
        number: ch.number,
        title: ch.title,
        dateUpdated: isoOrNull(ch.dateUpdated),
      })),
      tagMetadata: tagMetadata.map((t) => {
        const typeName = tagTypeIdToName[t.typeId];
        if (!typeName) {
          console.log({
            message: "Unknown tag type ID encountered",
            typeId: t.typeId,
            tag: t.tag,
            workId: t.workId,
          });
        }
        return {
          workId: t.workId,
          tag: t.tag,
          href: t.href,
          type: typeName ?? "unknown",
        };
      }),
      nextWorkCursor,
      hasMore: hasMoreWorks,
      serverLastUpdated: serverLastUpdated.toISOString(),
      latestWorkLastReadAt: isoOrNull(latestWorkLastReadAt),
      favouriteTags: includeFavouriteTags
        ? favouriteTags.map((f) => ({
            tagType: f.tagType,
            tag: f.tag,
            favourited: f.favourited,
            updatedAt: f.updatedAt.toISOString(),
          }))
        : undefined,
      savedSearches: includeFavouriteTags
        ? savedSearches.map((s) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            deleted: s.deleted,
            updatedAt: s.updatedAt.toISOString(),
          }))
        : undefined,
    });
  })
  .openapi(postSyncRoute, async (c) => {
    const user = c.var.user;
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const userId = user.id;
    const { works, chapters, favouriteTags, savedSearches } = c.req.valid("json");

    console.log({
      message: "POST /sync request",
      userId,
      worksCount: works?.length ?? 0,
      chaptersCount: chapters?.length ?? 0,
      favouriteTagsCount: favouriteTags?.length ?? 0,
      savedSearchesCount: savedSearches?.length ?? 0,
      workIds: works?.map((w) => w.workId) ?? [],
    });

    // Transform input data to batch format and process in parallel
    const worksToProcess =
      works?.map((w) => ({
        workId: w.workId,
        lastReadAt: new Date(w.lastReadAt),
        markedCompleteAt: w.markedCompleteAt ? new Date(w.markedCompleteAt) : null,
        private: w.private,
        subscribed: w.subscribed,
        favourite: w.favourite,
        subscribedUpdatedAt: w.subscribedUpdatedAt ? new Date(w.subscribedUpdatedAt) : null,
        favouriteUpdatedAt: w.favouriteUpdatedAt ? new Date(w.favouriteUpdatedAt) : null,
        deleted: w.deleted,
      })) ?? [];

    const chaptersToProcess =
      chapters?.map((ch) => ({
        workId: ch.workId,
        chapterId: ch.chapterId,
        lastReadAt: new Date(ch.lastReadAt),
        markedCompleteAt: ch.markedCompleteAt ? new Date(ch.markedCompleteAt) : null,
        readProgress: ch.readProgress,
        deleted: ch.deleted,
      })) ?? [];

    const favouriteTagsToProcess =
      favouriteTags?.map((f) => ({
        tagType: f.tagType,
        tag: f.tag,
        favourited: f.favourited,
        updatedAt: new Date(f.updatedAt),
      })) ?? [];

    const savedSearchesToProcess =
      savedSearches?.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        deleted: s.deleted,
        updatedAt: new Date(s.updatedAt),
      })) ?? [];

    // Process works, chapters, favourite tags, and saved searches in batch
    const [workResults, chapterResults, favouriteTagResults, savedSearchResults] =
      await Promise.all([
        batchProcessWorks(c.var.db, userId, worksToProcess),
        batchProcessChapters(c.var.db, userId, chaptersToProcess),
        batchUpsertFavouriteTags(c.var.db, userId, favouriteTagsToProcess),
        batchUpsertSavedSearches(c.var.db, userId, savedSearchesToProcess),
      ]);

    const workStatusCounts = {
      accepted: workResults.filter((r) => r.status === "accepted").length,
      ignored: workResults.filter((r) => r.status === "ignored").length,
      deleted: workResults.filter((r) => r.status === "deleted").length,
    };
    const chapterStatusCounts = {
      accepted: chapterResults.filter((r) => r.status === "accepted").length,
      ignored: chapterResults.filter((r) => r.status === "ignored").length,
    };
    const favouriteTagStatusCounts = {
      accepted: favouriteTagResults.filter((r) => r.status === "accepted").length,
      ignored: favouriteTagResults.filter((r) => r.status === "ignored").length,
    };
    const savedSearchStatusCounts = {
      accepted: savedSearchResults.filter((r) => r.status === "accepted").length,
      ignored: savedSearchResults.filter((r) => r.status === "ignored").length,
    };

    console.log({
      message: "POST /sync response",
      userId,
      workResults: workStatusCounts,
      chapterResults: chapterStatusCounts,
      favouriteTagResults: favouriteTagStatusCounts,
      savedSearchResults: savedSearchStatusCounts,
    });

    return c.json({
      works: workResults,
      chapters: chapterResults,
      favouriteTags: favouriteTags === undefined ? undefined : favouriteTagResults,
      savedSearches: savedSearches === undefined ? undefined : savedSearchResults,
      syncedAt: new Date().toISOString(),
    });
  });
