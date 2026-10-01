import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { and, eq, isNull, max } from "drizzle-orm";
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
export async function upsertBackup(db: TDatabase, data: TWorkBackupI): Promise<void> {
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
export async function findBackupsByWorkId(db: TDatabase, workId: number): Promise<BackupRecord[]> {
  return db.query.tWorkBackup.findMany({
    where: { workId, rowDeletedAt: { isNull: true } },
    orderBy: { rowCreatedAt: "desc" },
  });
}

/**
 * Find a single non-deleted backup by its r2Key. Used to gate downloads so
 * soft-deleted backups (hidden from the list) are not served from R2.
 */
export async function findActiveBackupByR2Key(
  db: TDatabase,
  r2Key: string,
): Promise<BackupRecord | null> {
  const result = await db.query.tWorkBackup.findFirst({
    where: { r2Key, rowDeletedAt: { isNull: true } },
  });
  return result ?? null;
}

/**
 * Find the latest active backup ao3UpdatedAt for one format of a work
 */
export async function findLatestBackupUpdatedAt(
  db: TDatabase,
  workId: number,
  format: TWorkBackupS["format"],
): Promise<Date | null> {
  const result = await db
    .select({ maxUpdatedAt: max(tWorkBackup.ao3UpdatedAt) })
    .from(tWorkBackup)
    .where(
      and(
        eq(tWorkBackup.workId, workId),
        eq(tWorkBackup.format, format),
        isNull(tWorkBackup.rowDeletedAt),
      ),
    );

  return result[0]?.maxUpdatedAt ?? null;
}
