import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
    datetime,
    index,
    mysqlEnum,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import {
    createInsertSchema,
    createSelectSchema,
    createUpdateSchema,
} from "drizzle-zod";
import { DB_TABLE_PREFIX } from "~/const";
import {
    type OmitTimestampCols,
    omitTimestampCols,
    timestampCols,
} from "~/db/helpers/schema";

/** Types of system-sent emails that we rate-limit per-recipient. */
export const emailSendTypes = [
    "password_reset",
    "email_verification",
] as const;
export type EmailSendType = (typeof emailSendTypes)[number];

/**
 * Per-recipient email send log used for per-email rate limiting.
 *
 * `(email, type)` is the primary key; `lastSentAt` is the most recent
 * successful send. The auth layer checks this before invoking the email
 * binding and refuses to re-send within a configurable cooldown window.
 */
export const tEmailSendLog = mysqlTable(
    `${DB_TABLE_PREFIX}email_send_log`,
    {
        email: varchar({ length: 255 }).notNull(),
        type: mysqlEnum("type", emailSendTypes).notNull(),
        lastSentAt: datetime().notNull(),
        ...timestampCols,
    },
    (table) => [
        primaryKey({ columns: [table.email, table.type] }),
        index("idx_email_send_log_lastSentAt").on(table.lastSentAt),
    ],
);

export const tEmailSendLogPK = [tEmailSendLog.email, tEmailSendLog.type] as const;
export const tEmailSendLogTimestampExclude = [
    tEmailSendLog.rowCreatedAt,
    tEmailSendLog.rowUpdatedAt,
] as const;

export type TEmailSendLogS = InferSelectModel<typeof tEmailSendLog>;
export type TEmailSendLogI = OmitTimestampCols<
    InferInsertModel<typeof tEmailSendLog>
>;

export const sEmailSendLogS = createSelectSchema(tEmailSendLog);
export const sEmailSendLogI = omitTimestampCols(
    createInsertSchema(tEmailSendLog),
);
export const sEmailSendLogU = omitTimestampCols(
    createUpdateSchema(tEmailSendLog),
);
