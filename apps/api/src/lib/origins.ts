/**
 * Parse a comma-separated `ALLOWED_ORIGINS` env var into a clean list of
 * origins. Shared by the CORS allow-list ({@link file://./../index.tsx}) and
 * Better Auth's `trustedOrigins` ({@link file://./auth.ts}) so both layers
 * agree on which web origins may talk to the API.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
