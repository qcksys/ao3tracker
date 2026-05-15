import { authTokenItem } from "./storage";

/**
 * Better Auth's bearer plugin reads the token via a synchronous accessor,
 * but `authTokenItem` is async. We keep a module-scoped cache that's seeded
 * at startup and updated via `set` (after sign-in) or `storage.watch` (when
 * another extension tier mutates the token).
 */
let cachedToken: string | null = null;
let initialized = false;

export async function loadAuthToken(): Promise<string | null> {
  cachedToken = await authTokenItem.getValue();
  if (!initialized) {
    authTokenItem.watch((next) => {
      cachedToken = next;
    });
    initialized = true;
  }
  return cachedToken;
}

export function getCachedAuthToken(): string | null {
  return cachedToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  await authTokenItem.setValue(token);
}
