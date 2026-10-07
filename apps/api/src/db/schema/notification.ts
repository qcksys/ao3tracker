import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

export const notificationTypes = [
  "new_chapters",
  "work_completed",
  "work_restricted",
  "work_deleted",
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const notificationStatuses = ["pending", "sent", "failed"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

export const tNotification = mysqlTable(
  `${DB_TABLE_PREFIX}notification`,
  {
    id: bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: varchar({ length: 36 }).notNull(),
    workId: int({ unsigned: true }).notNull(),
    type: mysqlEnum("type", notificationTypes).notNull(),
    eventKey: varchar({ length: 64 }),
    status: mysqlEnum("status", notificationStatuses).notNull().default("pending"),
    dispatchPending: boolean().notNull().default(false),
    dispatchClaim: varchar({ length: 36 }),
    dispatchClaimedAt: datetime(),
    title: varchar({ length: 255 }).notNull(),
    body: text().notNull(),
    payload: text(),
    sentAt: datetime(),
    fcmMessageId: varchar({ length: 255 }),
    errorMessage: text(),
    retryCount: int({ unsigned: true }).notNull().default(0),
    ...timestampCols,
  },
  (table) => {
    return [
      index("idx_notification_userId").on(table.userId),
      uniqueIndex("idx_notification_event").on(
        table.userId,
        table.workId,
        table.type,
        table.eventKey,
      ),
      index("idx_notification_workId").on(table.workId),
      index("idx_notification_status").on(table.status),
      index("idx_notification_dispatch").on(table.dispatchPending, table.rowUpdatedAt),
      index("idx_notification_type").on(table.type),
      index("idx_notification_user_status").on(table.userId, table.status),
      index("idx_notification_rowCreatedAt").on(table.rowCreatedAt),
    ];
  },
);

export type TNotificationS = InferSelectModel<typeof tNotification>;
export type TNotificationI = OmitTimestampCols<InferInsertModel<typeof tNotification>>;

export const sNotificationS = createSelectSchema(tNotification);
export const sNotificationI = omitTimestampCols(createInsertSchema(tNotification));
export const sNotificationU = omitTimestampCols(createUpdateSchema(tNotification));
