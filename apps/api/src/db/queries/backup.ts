import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { eq, max } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
    type TWorkBackupI,
    type TWorkBackupS,
    tWorkBackup,
    tWorkBackupTimestampExclude,
} from "~/db/schema/work.backup";

/** Data returned when querying backup records */
export type BackupRecord = Pick<
    TWorkBackupS,
    "workId" | "format" | "r2Key" | "fileSize" | "ao3UpdatedAt" | "rowCreatedAt"
>;

/**
 * Upsert a backup record
 */
export async function upsertBackup(
    db: TDatabase,
    data: TWorkBackupI,
): Promise<void> {
    await db
        .insert(tWorkBackup)
        .values(data)
        .onDuplicateKeyUpdate(
            onDuplicateKeyUpdateConfig(tWorkBackup, {
                exclude: tWorkBackupTimestampExclude,
            }),
        );
}

/**
 * Find all backups for a work
 */
export async function findBackupsByWorkId(
    db: TDatabase,
    workId: number,
): Promise<BackupRecord[]> {
    return db.query.tWorkBackup.findMany({
        where: (t, { and, eq, isNull }) =>
            and(eq(t.workId, workId), isNull(t.rowDeletedAt)),
        orderBy: (t, { desc }) => desc(t.rowCreatedAt),
    });
}

/**
 * Find the latest backup ao3UpdatedAt for a work
 */
export async function findLatestBackupUpdatedAt(
    db: TDatabase,
    workId: number,
): Promise<Date | null> {
    const result = await db
        .select({ maxUpdatedAt: max(tWorkBackup.ao3UpdatedAt) })
        .from(tWorkBackup)
        .where(eq(tWorkBackup.workId, workId));

    return result[0]?.maxUpdatedAt ?? null;
}
