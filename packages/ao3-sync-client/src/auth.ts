import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

/**
 * Options for {@link createAo3AuthClient}. Mirrors {@link SyncClientConfig} but
 * keeps the auth client surface independent of the sync transport so callers
 * can wire the two against different storage layers if needed.
 */
export interface Ao3AuthClientOptions {
  baseURL: string;
  /**
   * Synchronous read of the cached bearer token. Must return the latest value
   * known to the calling tier — the better-auth client invokes this on every
   * request and Better Auth's bearer plugin only supports sync accessors.
   */
  getBearerToken?: () => string | null;
  /**
   * Called when a request returns a `set-auth-token` header. Implementations
   * persist the token (e.g. into extension storage) so other tiers see it.
   */
  setBearerToken?: (token: string | null) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

/**
 * Create a Better Auth client wired with the plugins the AO3 Tracker server
 * exposes today (`bearer`, `passkey`, `twoFactor`). The bearer token plumbing
 * is handled here so callers only need to supply storage callbacks.
 */
export function createAo3AuthClient(opts: Ao3AuthClientOptions) {
  return createAuthClient({
    baseURL: opts.baseURL,
    plugins: [passkeyClient(), twoFactorClient()],
    fetchOptions: {
      customFetchImpl: opts.fetchImpl,
      auth: {
        type: "Bearer",
        token: () => opts.getBearerToken?.() ?? "",
      },
      onSuccess: async (ctx) => {
        if (!opts.setBearerToken) return;
        const token = ctx.response.headers.get("set-auth-token");
        if (token) await opts.setBearerToken(token);
      },
    },
  });
}

export type Ao3AuthClient = ReturnType<typeof createAo3AuthClient>;
