import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import {
  getCachedAuthToken,
  setAuthToken,
} from "@/lib/auth-token-cache";

function createClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [passkeyClient(), twoFactorClient()],
    fetchOptions: {
      auth: {
        type: "Bearer",
        token: () => getCachedAuthToken() ?? "",
      },
      onSuccess: async (ctx) => {
        const token = ctx.response.headers.get("set-auth-token");
        if (token) await setAuthToken(token);
      },
    },
  });
}

type AuthClient = ReturnType<typeof createClient>;

let instance: AuthClient | null = null;

export function initAuthClient(url: string): void {
  instance = createClient(url);
}

// Better Auth captures `baseURL` at construction time, so the client must be
// built after we've read the user-overridable api endpoint from storage. The
// popup's main.tsx awaits `initAuthClient` before mounting React; every
// consumer is a component, so by render time `instance` is set.
export const authClient = new Proxy({} as AuthClient, {
  get(_, prop) {
    if (!instance) {
      throw new Error("authClient accessed before initAuthClient()");
    }
    return Reflect.get(instance, prop);
  },
});

export type AuthSession = ReturnType<AuthClient["useSession"]>;
