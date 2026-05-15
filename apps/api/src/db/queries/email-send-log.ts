import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { and, eq } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
    type EmailSendType,
    tEmailSendLog,
    tEmailSendLogPK,
    tEmailSendLogTimestampExclude,
} from "~/db/schema/auth.emailSendLog";

/**
 * Get the timestamp of the last email sent of the given type to this address,
 * or null if none has been sent.
 */
export async function getLastSentAt(
    db: TDatabase,
    email: string,
    type: EmailSendType,
): Promise<Date | null> {
    const result = await db
        .select({ lastSentAt: tEmailSendLog.lastSentAt })
        .from(tEmailSendLog)
        .where(
            and(eq(tEmailSendLog.email, email), eq(tEmailSendLog.type, type)),
        )
        .limit(1);
    return result[0]?.lastSentAt ?? null;
}

/**
 * Record that an email of the given type was just sent to this address.
 * Upserts so repeated sends overwrite the prior `lastSentAt`.
 */
export async function recordEmailSent(
    db: TDatabase,
    email: string,
    type: EmailSendType,
    sentAt: Date = new Date(),
): Promise<void> {
    await db
        .insert(tEmailSendLog)
        .values({ email, type, lastSentAt: sentAt })
        .onDuplicateKeyUpdate(
            onDuplicateKeyUpdateConfig(tEmailSendLog, {
                exclude: [
                    ...tEmailSendLogPK,
                    ...tEmailSendLogTimestampExclude,
                ],
            }),
        );
}
