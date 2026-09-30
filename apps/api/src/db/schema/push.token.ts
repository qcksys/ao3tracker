import { type InferInsertModel, type InferSelectModel, relations } from "drizzle-orm";
import { datetime, index, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import { type OmitTimestampCols, omitTimestampCols, timestampCols } from "~/db/helpers/schema";
import { tAuthUser } from "~/db/schema/auth.user";

export const tPushToken = mysqlTable(
  `${DB_TABLE_PREFIX}push_token`,
  {
    userId: varchar({ length: 36 }).notNull(),
    deviceId: varchar({ length: 64 }).notNull(),
    token: varchar({ length: 512 }).notNull(),
    platform: varchar({ length: 16 }).notNull().default("android"),
    lastValidatedAt: datetime().notNull(),
    ...timestampCols,
  },
  (table) => {
    return [
      primaryKey({ columns: [table.userId, table.deviceId] }),
      index("idx_push_token_token").on(table.token),
      index("idx_push_token_userId").on(table.userId),
      index("idx_push_token_rowDeletedAt").on(table.rowDeletedAt),
    ];
  },
);

/** Composite primary key target for upsert operations */
export const tPushTokenPK = [tPushToken.userId, tPushToken.deviceId] as const;
/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tPushTokenTimestampExclude = [
  tPushToken.rowCreatedAt,
  tPushToken.rowUpdatedAt,
] as const;

export const rPushToken = relations(tPushToken, ({ one }) => ({
  user: one(tAuthUser, {
    fields: [tPushToken.userId],
    references: [tAuthUser.id],
  }),
}));

export type TPushTokenS = InferSelectModel<typeof tPushToken>;
export type TPushTokenI = OmitTimestampCols<InferInsertModel<typeof tPushToken>>;

export const sPushTokenS = createSelectSchema(tPushToken);
export const sPushTokenI = omitTimestampCols(createInsertSchema(tPushToken));
export const sPushTokenU = omitTimestampCols(createUpdateSchema(tPushToken));
