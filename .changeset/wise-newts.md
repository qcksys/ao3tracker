---
"@qcksys/ao3tracker-sync-client": minor
"@qcksys/ao3tracker-browser-extension": minor
---

Replace the hand-rolled auth wrappers with the official Better Auth client.

**Sync client:** removes the `signInEmail` / `signUpEmail` / `signOut` / `getSession` helpers in favour of a `createAo3AuthClient(opts)` factory that returns a Better Auth client preconfigured with the `passkey` and `twoFactor` plugins and a bearer-token storage callback. Existing consumers must migrate to `client.signIn.email(...)`, `client.signOut()`, etc.

**Browser extension:** the popup now drives sign-in / sign-up / sign-out / `useSession` via `better-auth/react` directly instead of message-passing through the background. Bearer tokens still live in `authTokenItem` (`@wxt-dev/storage`), shared between popup and background via a small sync cache. The background watches the token and triggers a sync whenever it changes. New Login screen "Use passkey" and Settings "Add passkey" buttons surface the passkey plugin.
