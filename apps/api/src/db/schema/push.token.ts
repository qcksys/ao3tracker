import {
  type NotificationPreferences,
  notificationPreferencesSchema,
} from "@qcksys/ao3tracker-core/notifications";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";

export const tPushToken = pgTable(
  `${DB_TABLE_PREFIX}push_token`,
  {
    userId: varchar({ length: 36 }).notNull(),
    deviceId: varchar({ length: 64 }).notNull(),
    token: varchar({ length: 512 }).notNull(),
    platform: varchar({ length: 16 }).notNull().default("android"),
    lastValidatedAt: timestamp({ withTimezone: true, precision: 0 }).notNull(),
    notificationPreferences: jsonb().$type<NotificationPreferences>(),
    ...timestampCols,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.userId, table.deviceId] }),
      index(`${DB_TABLE_PREFIX}idx_push_token_token`).on(table.token),
      index(`${DB_TABLE_PREFIX}idx_push_token_rowDeletedAt`).on(table.rowDeletedAt),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tPushTokenPK = [tPushToken.userId, tPushToken.deviceId] as const;
/** Columns to exclude from upserts (preserve creation time and let the trigger record changes) */
export const tPushTokenTimestampExclude = [
  tPushToken.rowCreatedAt,
  tPushToken.rowUpdatedAt,
] as const;

export type TPushTokenS = InferSelectModel<typeof tPushToken>;
export type TPushTokenI = OmitTimestampCols<InferInsertModel<typeof tPushToken>>;

export const sPushTokenS = createSelectSchema(tPushToken, {
  notificationPreferences: notificationPreferencesSchema.nullable(),
});
export const sPushTokenI = omitTimestampCols(
  createInsertSchema(tPushToken, {
    notificationPreferences: notificationPreferencesSchema.nullable().optional(),
  }),
);
export const sPushTokenU = omitTimestampCols(
  createUpdateSchema(tPushToken, {
    notificationPreferences: notificationPreferencesSchema.nullable().optional(),
  }),
);
