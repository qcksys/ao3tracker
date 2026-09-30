import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions/onDuplicateKeyUpdate";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { TDatabase } from "~/db/db.client";
import {
  type TPushTokenI,
  type TPushTokenS,
  tPushToken,
  tPushTokenPK,
  tPushTokenTimestampExclude,
} from "~/db/schema/push.token";

/** Data for token registration */
export type PushTokenRegister = Pick<
  TPushTokenI,
  "userId" | "token" | "deviceId" | "platform" | "lastValidatedAt"
>;

/**
 * Upsert a push token (register or update)
 */
export async function upsertPushToken(db: TDatabase, data: PushTokenRegister): Promise<void> {
  await db
    .insert(tPushToken)
    .values(data)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tPushToken, {
        exclude: [...tPushTokenPK, ...tPushTokenTimestampExclude],
      }),
    );
}

/**
 * Get all active tokens for a user
 */
export async function getTokensByUserId(db: TDatabase, userId: string): Promise<TPushTokenS[]> {
  return db
    .select()
    .from(tPushToken)
    .where(and(eq(tPushToken.userId, userId), isNull(tPushToken.rowDeletedAt)));
}

/**
 * Get all active tokens for multiple users (for batch notifications)
 */
export async function getTokensByUserIds(db: TDatabase, userIds: string[]): Promise<TPushTokenS[]> {
  if (userIds.length === 0) return [];
  return db
    .select()
    .from(tPushToken)
    .where(and(inArray(tPushToken.userId, userIds), isNull(tPushToken.rowDeletedAt)));
}

/**
 * Soft-delete a token (unregister device)
 */
export async function deletePushToken(
  db: TDatabase,
  userId: string,
  deviceId: string,
): Promise<void> {
  await db
    .update(tPushToken)
    .set({ rowDeletedAt: new Date() })
    .where(
      and(
        eq(tPushToken.userId, userId),
        eq(tPushToken.deviceId, deviceId),
        isNull(tPushToken.rowDeletedAt),
      ),
    );
}

/**
 * Invalidate a token by its value (when FCM reports it invalid)
 */
export async function invalidateToken(db: TDatabase, token: string): Promise<void> {
  await db
    .update(tPushToken)
    .set({ rowDeletedAt: new Date() })
    .where(and(eq(tPushToken.token, token), isNull(tPushToken.rowDeletedAt)));
}

/**
 * Delete all tokens for a user (account deletion/logout all)
 */
export async function deleteAllUserTokens(db: TDatabase, userId: string): Promise<void> {
  await db
    .update(tPushToken)
    .set({ rowDeletedAt: new Date() })
    .where(and(eq(tPushToken.userId, userId), isNull(tPushToken.rowDeletedAt)));
}
