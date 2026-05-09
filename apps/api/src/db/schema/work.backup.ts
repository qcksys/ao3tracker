import {
    type InferInsertModel,
    type InferSelectModel,
    relations,
} from "drizzle-orm";
import {
    bigint,
    datetime,
    index,
    int,
    mysqlEnum,
    mysqlTable,
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
import { tWork } from "~/db/schema/work";

export const backupFormats = ["html", "pdf", "mobi", "epub", "azw3"] as const;
export type BackupFormat = (typeof backupFormats)[number];

export const tWorkBackup = mysqlTable(
    `${DB_TABLE_PREFIX}work_backup`,
    {
        r2Key: varchar({ length: 512 }).notNull().primaryKey(),
        workId: int({ unsigned: true }).notNull(),
        format: mysqlEnum(backupFormats).notNull(),
        fileSize: bigint({ mode: "number", unsigned: true }).notNull(),
        ao3UpdatedAt: datetime(),
        ...timestampCols,
    },
    (table) => {
        return [
            index("idx_work_backup_workId").on(table.workId),
            index("idx_work_backup_format").on(table.workId, table.format),
            index("idx_work_backup_rowCreatedAt").on(table.rowCreatedAt),
            index("idx_work_backup_rowDeletedAt").on(table.rowDeletedAt),
        ];
    },
);

export const rWorkBackup = relations(tWorkBackup, ({ one }) => ({
    work: one(tWork, {
        fields: [tWorkBackup.workId],
        references: [tWork.id],
    }),
}));

export type TWorkBackupS = InferSelectModel<typeof tWorkBackup>;
export type TWorkBackupI = OmitTimestampCols<
    InferInsertModel<typeof tWorkBackup>
>;
/** Columns to exclude from upserts (preserve creation time, let ON UPDATE handle update time) */
export const tWorkBackupTimestampExclude = [
    tWorkBackup.rowCreatedAt,
    tWorkBackup.rowUpdatedAt,
] as const;

export const sWorkBackupS = createSelectSchema(tWorkBackup);
export const sWorkBackupI = omitTimestampCols(createInsertSchema(tWorkBackup));
export const sWorkBackupU = omitTimestampCols(createUpdateSchema(tWorkBackup));
