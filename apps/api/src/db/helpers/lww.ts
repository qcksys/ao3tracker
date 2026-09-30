/**
 * Last-Write-Wins (LWW) conflict resolution helper
 *
 * Used for per-field sync where each field has its own timestamp.
 * Falls back to a shared timestamp (e.g., lastReadAt) when the
 * field-specific timestamp is not set.
 */

export interface LWWField<T> {
  value: T;
  updatedAt: Date | null;
  fallbackTs: Date;
}

export interface LWWResult<T> {
  shouldUpdate: boolean;
  value: T;
  updatedAt: Date;
}

/**
 * Last-Write-Wins conflict resolution for a single field.
 *
 * Resolution rules:
 * 1. If only one side has an explicit timestamp, that side wins
 * 2. If both have explicit timestamps, compare them (server wins on tie)
 * 3. If neither has an explicit timestamp, compare fallback timestamps (server wins on tie)
 *
 * @param client - Client's field value and timestamps
 * @param server - Server's field value and timestamps
 * @returns Resolution result with shouldUpdate flag and winning value/timestamp
 */
export function resolveLWW<T>(client: LWWField<T>, server: LWWField<T>): LWWResult<T> {
  const clientHasTs = client.updatedAt !== null;
  const serverHasTs = server.updatedAt !== null;

  // If only client has explicit timestamp, client wins
  if (clientHasTs && !serverHasTs) {
    return {
      shouldUpdate: true,
      value: client.value,
      updatedAt: client.updatedAt as Date,
    };
  }

  // If only server has explicit timestamp, server wins
  if (serverHasTs && !clientHasTs) {
    return {
      shouldUpdate: false,
      value: server.value,
      updatedAt: server.updatedAt as Date,
    };
  }

  // Both have timestamps or neither has - compare them
  const clientTs = client.updatedAt ?? client.fallbackTs;
  const serverTs = server.updatedAt ?? server.fallbackTs;

  if (clientTs > serverTs) {
    return {
      shouldUpdate: true,
      value: client.value,
      updatedAt: clientTs,
    };
  }

  return {
    shouldUpdate: false,
    value: server.value,
    updatedAt: serverTs,
  };
}
