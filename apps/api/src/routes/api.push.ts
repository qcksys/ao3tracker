import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getUserNotifications } from "~/db/queries/notification";
import { deletePushToken, upsertPushToken } from "~/db/queries/push-token";
import { sNotificationS } from "~/db/schema/notification";
import type { TRouterEnvAuthReq } from "~/middleware/requireAuthMw";

const registerTokenSchema = z
    .object({
        token: z.string().min(1).max(512),
        deviceId: z.string().min(1).max(64),
        platform: z.enum(["android", "ios"]).default("android"),
    })
    .openapi({ description: "Push token registration request" });

const registerRoute = createRoute({
    method: "post",
    path: "/token",
    tags: ["API/Push"],
    summary: "Register push notification token",
    description:
        "Registers an FCM token for the current user's device. Call this on app startup and whenever the FCM token refreshes.",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: registerTokenSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: "Token registered successfully",
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                    }),
                },
            },
        },
        401: { description: "Unauthorized" },
    },
});

const unregisterRoute = createRoute({
    method: "delete",
    path: "/token/{deviceId}",
    tags: ["API/Push"],
    summary: "Unregister push notification token",
    description: "Removes the FCM token for the specified device.",
    request: {
        params: z.object({
            deviceId: z.string(),
        }),
    },
    responses: {
        200: {
            description: "Token unregistered successfully",
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                    }),
                },
            },
        },
        401: { description: "Unauthorized" },
    },
});

// ============================================================================
// Notification History
// ============================================================================

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;

const dateToIsoString = z.iso.datetime();

const notificationHistoryItemSchema = sNotificationS
    .pick({
        id: true,
        workId: true,
        type: true,
        title: true,
        body: true,
    })
    .extend({
        sentAt: dateToIsoString.nullable().openapi({
            description: "ISO 8601 timestamp when notification was sent",
            example: "2025-11-30T12:00:00.000Z",
        }),
        createdAt: dateToIsoString.openapi({
            description: "ISO 8601 timestamp when notification was created",
            example: "2025-11-30T12:00:00.000Z",
        }),
    })
    .openapi({ description: "Notification history item" });

const notificationHistoryQuerySchema = z.object({
    cursor: z.coerce.number().int().positive().optional().openapi({
        description:
            "Cursor for pagination (notification ID). Use nextCursor from previous response.",
        example: 12345,
    }),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_HISTORY_LIMIT)
        .optional()
        .openapi({
            description: `Max notifications to return. Default: ${DEFAULT_HISTORY_LIMIT}, Max: ${MAX_HISTORY_LIMIT}`,
            example: DEFAULT_HISTORY_LIMIT,
        }),
});

const notificationHistoryResponseSchema = z.object({
    notifications: z.array(notificationHistoryItemSchema).openapi({
        description: "List of notifications, newest first",
    }),
    nextCursor: z.number().nullable().openapi({
        description: "Cursor for next page, or null if no more notifications",
        example: 12344,
    }),
    hasMore: z.boolean().openapi({
        description: "True if there are more notifications to fetch",
        example: false,
    }),
});

const notificationHistoryRoute = createRoute({
    method: "get",
    path: "/notifications",
    tags: ["API/Push"],
    summary: "Get notification history",
    description: `Retrieves the user's notification history with cursor-based pagination.

**Pagination:**
- Default limit: ${DEFAULT_HISTORY_LIMIT}, max: ${MAX_HISTORY_LIMIT}
- Use \`nextCursor\` from response for next page
- Continue fetching while \`hasMore\` is true

**Notification Types:**
- \`new_chapters\`: New chapters available for a tracked work
- \`work_completed\`: A tracked work has been marked as complete
- \`work_restricted\`: A tracked work now requires AO3 login
- \`work_deleted\`: A tracked work has been deleted from AO3`,
    request: {
        query: notificationHistoryQuerySchema,
    },
    responses: {
        200: {
            description: "Notification history retrieved successfully",
            content: {
                "application/json": {
                    schema: notificationHistoryResponseSchema,
                },
            },
        },
        401: { description: "Unauthorized" },
    },
});

export const pushRouter = new OpenAPIHono<TRouterEnvAuthReq>()
    .openapi(registerRoute, async (c) => {
        const userId = c.var.user.id;
        const { token, deviceId, platform } = c.req.valid("json");

        await upsertPushToken(c.var.db, {
            userId,
            token,
            deviceId,
            platform,
            lastValidatedAt: new Date(),
        });

        console.log({
            message: "Push token registered",
            userId,
            deviceId,
            platform,
        });

        return c.json({ success: true });
    })
    .openapi(unregisterRoute, async (c) => {
        const userId = c.var.user.id;
        const { deviceId } = c.req.valid("param");

        await deletePushToken(c.var.db, userId, deviceId);

        console.log({
            message: "Push token unregistered",
            userId,
            deviceId,
        });

        return c.json({ success: true });
    })
    .openapi(notificationHistoryRoute, async (c) => {
        const userId = c.var.user.id;
        const { cursor, limit } = c.req.valid("query");

        const { notifications, hasMore } = await getUserNotifications(
            c.var.db,
            userId,
            {
                cursor,
                limit: limit ?? DEFAULT_HISTORY_LIMIT,
            },
        );

        const nextCursor =
            hasMore && notifications.length > 0
                ? notifications[notifications.length - 1].id
                : null;

        console.log({
            message: "Notification history fetched",
            userId,
            count: notifications.length,
            hasMore,
            cursor: cursor ?? null,
        });

        return c.json({
            notifications: notifications.map((n) => ({
                id: n.id,
                workId: n.workId,
                type: n.type,
                title: n.title,
                body: n.body,
                sentAt: n.sentAt?.toISOString() ?? null,
                createdAt: n.rowCreatedAt.toISOString(),
            })),
            nextCursor,
            hasMore,
        });
    });
