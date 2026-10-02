# @qcksys/ao3tracker-sync-client

## 0.1.1

### Patch Changes

- Updated dependencies
- Updated dependencies [8e9d240]
- Updated dependencies [7964092]
- Updated dependencies [fe279ed]
- Updated dependencies [9ffbe51]
  - @qcksys/ao3tracker-core@0.2.0

## 0.1.0

### Minor Changes

- e524c4a: Add saved searches: name and save an AO3 filter/search URL from a "Save this search" button injected on AO3 list pages, then open, rename, or delete them later. Saved searches sync across devices via `/api/track/sync` (new optional `savedSearches` array, per-row LWW keyed by a client-generated uuid, tombstone deletes) backed by a new `user_saved_search` table.

  - **Browser extension**: on-page save button and a "Searches" popup tab to open/rename/delete. Both clients show "Saved search" when viewing saved filters, including subsequent result pages. Suggested names list the applied filters, excluding pagination and current results, and remain editable.
  - **Both clients**: add Hide work/Unhide controls to AO3 lists and device-local search preferences in Settings. Default hidden tags start empty and are merged into every AO3 work/bookmark search; Settings also restores hidden works. Choose a language from the AO3 language list and enable automatic filtering for every work and bookmark search, including saved searches. The language setting starts disabled and stays local to each device. Set a maximum fandom count to hide works above the limit in work and bookmark lists; a limit of 1 also applies AO3’s Exclude crossovers filter to work searches. Leave the limit blank for unrestricted browsing. Saved-search checks respect the same limit.
  - **Native (KMP)**: on-page save button in the WebView with a naming dialog (Read tab), and a dedicated "Searches" tab to open, rename, or delete saved searches. Rename the "Track" tab to "Works". Includes a new `saved_search` Room table (DB v6) + repository + sync wiring.

  On Android and iOS, show the number of new and updated works for each saved search since its previous successful check. Check when opening Searches or refresh manually. Establish a baseline on the first check and keep previous counts if AO3 cannot be checked. Counts and check history stay on this device and do not trigger sync or notifications.

  Add a Copy link action to saved searches in the native app and browser extension, with confirmation when the full search URL is copied for sharing.

  Fix cross-device synchronization and local data safety:

  - Isolate each account and API environment, preserving its local data and pending edits when switching accounts. Native Room DB v8 stores each account and guest in a separate database file and migrates existing data automatically.
  - Add a native Settings action to copy guest works, progress, favourite tags and saved searches into the signed-in account. Preserve existing account entries and the guest library, and keep imported data ready for sync. Signing out keeps local account data for the next sign-in.
  - Preserve edits made during GET/POST requests, acknowledge only uploaded versions, merge partial tag metadata, and retain the first pagination watermark.
  - Use server mutation timestamps with bounded replay for incremental sync, atomic last-write-wins updates, and persistent deletion tombstones. Apply API migration `0011_sync-mutation-cursors` before deploying the new server.
  - Preserve native deletions during metadata refresh and when another device's clock is ahead, synchronize mark-unread resets, use server values on timestamp ties, and clear local data only after a successful sync with no intervening edits.
  - Report the chapter identified in the page DOM when tracking scroll progress on a work's root URL.
  - Restore a deleted extension work when reading resumes, while retaining deletion for flag-only edits.
  - Batch native favourite tags and saved searches at the API's 500-row limit, including uploads containing only those collections.
  - Preserve chapter-zero tombstones when single-chapter works gain real chapter IDs, and reconcile later legacy uploads without duplicating progress.

- 1bd631b: Replace the hand-rolled auth wrappers with the official Better Auth client.

  **Sync client:** removes the `signInEmail` / `signUpEmail` / `signOut` / `getSession` helpers in favour of a `createAo3AuthClient(opts)` factory that returns a Better Auth client preconfigured with the `passkey` and `twoFactor` plugins and a bearer-token storage callback. Existing consumers must migrate to `client.signIn.email(...)`, `client.signOut()`, etc.

  **Browser extension:** the popup now drives sign-in / sign-up / sign-out / `useSession` via `better-auth/react` directly instead of message-passing through the background. Bearer tokens still live in `authTokenItem` (`@wxt-dev/storage`), shared between popup and background via a small sync cache. The background watches the token and triggers a sync whenever it changes. New Login screen "Use passkey" and Settings "Add passkey" buttons surface the passkey plugin.

### Patch Changes

- e524c4a: Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

  Upgrade Drizzle ORM and Kit to 1.0.0-rc.4, migrate the PlanetScale client and relational queries, and use Drizzle's built-in Zod schema generation. Keep the PlanetScale driver on the compatible 1.x line. Report migration failures with their underlying causes while redacting connection credentials.

  Convert migration files to timestamped folders without changing historical SQL. The deployment check supports both legacy and RC migration ledgers and remains read-only. The first manual RC migration run adds and backfills the ledger's `name` and `applied_at` columns before applying pending SQL; review pending migrations and use PlanetScale's schema-change process before running it.

  Apply API migration `20260930103837_auth-two-factor-lockout` (formerly `0012`) before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.

- Updated dependencies [25eabd5]
- Updated dependencies [e524c4a]
- Updated dependencies [5071abb]
- Updated dependencies [e524c4a]
  - @qcksys/ao3tracker-core@0.1.0
