import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

export const notificationTypes = [
  "new_chapters",
  "work_completed",
  "work_restricted",
  "work_deleted",
] as const;
export const notificationType = pgEnum(`${DB_TABLE_PREFIX}notification_type`, notificationTypes);
export type NotificationType = (typeof notificationTypes)[number];

export const notificationStatuses = ["pending", "sent", "failed"] as const;
export const notificationStatus = pgEnum(
  `${DB_TABLE_PREFIX}notification_status`,
  notificationStatuses,
);
export type NotificationStatus = (typeof notificationStatuses)[number];

export const tNotification = pgTable(
  `${DB_TABLE_PREFIX}notification`,
  {
    id: bigint({ mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    userId: varchar({ length: 36 }).notNull(),
    workId: bigint({ mode: "number" }).notNull(),
    type: notificationType().notNull(),
    eventKey: varchar({ length: 64 }),
    status: notificationStatus().notNull().default("pending"),
    dispatchPending: boolean().notNull().default(false),
    dispatchClaim: varchar({ length: 36 }),
    dispatchClaimedAt: timestamp({ withTimezone: true, precision: 0 }),
    title: varchar({ length: 255 }).notNull(),
    body: text().notNull(),
    payload: text(),
    sentAt: timestamp({ withTimezone: true, precision: 0 }),
    fcmMessageId: varchar({ length: 255 }),
    errorMessage: text(),
    retryCount: bigint({ mode: "number" }).notNull().default(0),
    ...timestampCols,
  },
  (table) => {
    return [
      uniqueIndex(`${DB_TABLE_PREFIX}idx_notification_event`).on(
        table.userId,
        table.workId,
        table.type,
        table.eventKey,
      ),
      index(`${DB_TABLE_PREFIX}idx_notification_workId`).on(table.workId),
      index(`${DB_TABLE_PREFIX}idx_notification_status`).on(table.status),
      index(`${DB_TABLE_PREFIX}idx_notification_dispatch`).on(
        table.dispatchPending,
        table.rowUpdatedAt,
      ),
      index(`${DB_TABLE_PREFIX}idx_notification_type`).on(table.type),
      index(`${DB_TABLE_PREFIX}idx_notification_user_status`).on(table.userId, table.status),
      index(`${DB_TABLE_PREFIX}idx_notification_rowCreatedAt`).on(table.rowCreatedAt),
    ];
  },
);

export type TNotificationS = InferSelectModel<typeof tNotification>;
export type TNotificationI = OmitTimestampCols<InferInsertModel<typeof tNotification>>;

export const sNotificationS = createSelectSchema(tNotification);
export const sNotificationI = omitTimestampCols(createInsertSchema(tNotification));
export const sNotificationU = omitTimestampCols(createUpdateSchema(tNotification));
