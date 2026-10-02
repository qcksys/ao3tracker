# @qcksys/ao3tracker-api

## 0.1.0

### Minor Changes

- 25eabd5: Bring the browser extension closer to feature-parity with the native app, and tighten the API's email flows.

  API:

  - Enable Better Auth's database-backed rate limit with custom rules for `/sign-in/email`, `/sign-up/email`, `/forget-password`, `/request-password-reset`, `/reset-password`, and `/send-verification-email`. Also enables IPv6 /64 subnet rate limiting.
  - Add a per-recipient cooldown (60s) on password-reset and verification emails on top of Better Auth's per-IP limit, gated on a new `email_send_log` table. Better Auth already only fires `sendResetPassword` for accounts that exist, so the cooldown completes the "only send emails for accounts that exist" requirement.
  - Host a static `/reset-password` page so the link in reset emails is actionable without a separate web frontend.
  - New `auth_rate_limit` table for Better Auth's rate-limit counters.
  - Migrate the landing and reset-password pages from inline HTML strings to TSX components rendered through `hono/jsx`, styled with Tailwind v4. Worker entry renamed to `src/index.tsx`.
  - Switch the worker build to Vite via `@cloudflare/vite-plugin` (replacing direct `wrangler dev`/`wrangler deploy` bundling). `vite dev` runs the worker locally via miniflare, `vite build` emits a deploy-ready bundle, and `wrangler deploy` ships it. Tailwind CSS is compiled at build time by `@tailwindcss/vite` and imported via Vite's native `?inline` query suffix — no CDN, no wrangler `Text` rule, no separate build step. The `dev` script now runs `vite dev` behind portless on port 5173; `deploy:dev` / `deploy:prod` use `vite build --mode dev` / `--mode prod` which `vite.config.ts` maps to `CLOUDFLARE_ENV` so the cloudflare plugin selects the right wrangler env section.

  Browser extension:

  - New "Works" tab — full tracked-works list with search, status filters (not-started, in-progress, caught-up, finished, new chapters, private), favourite/subscribed toggles, pinned-tag chips, and sort by last-read / title / author / word count / kudos / hits / bookmarks / comments / published / updated / chapters.
  - Push notifications via polling — the background worker polls `/api/push/notifications` on the existing 5-minute sync alarm and surfaces new entries as `chrome.notifications`. Clicking a notification opens the work on AO3. Settings provides a master switch and separate choices for new chapters, completed works, restricted works, and deleted works. Choices stay in this browser and preserve the existing on/off setting. Muted notifications consumed by polling are not replayed later.

  - New "Forgot password" page wired to Better Auth's `requestPasswordReset`, sending the user to the hosted reset page after they click the email link.
  - Manifest now requests the `notifications` permission.

  Native notification settings provide the same choices per device, persisted across app restarts and sent with push registration. The API filters each device's alerts at delivery time, including retries, while keeping notification history available. Apply migration `20261001231352_device-notification-preferences` and deploy the API before releasing the native client.

  Open the associated work in the Read tab and close notification history when a native notification history entry is tapped.

  Retry failed notification queue submissions from persisted pending records, including when no further work update occurs. Apply `20261002000754_notification-dispatch-outbox` before deploying this API; existing notification history is excluded from retries. Align Android background notification taps and channels, initialize notification storage before background callbacks, preserve the device push token across sign-out, and recover tokens erased by earlier versions before registration.

  Organize Settings in both clients into compact, expandable sections with visible status summaries. Keep account controls at the top and API/developer options under Advanced. Group native reading controls together and make library management and app information easier to find.

  Show the installed native app version, build number where available, and UTC build time in About.

- e9628d6: Favourite tag filters now sync across devices.

  **API:** `/api/track/sync` gains an optional `favouriteTags` block in both directions (GET response and POST request/response). Per-row `(tagType, tag, favourited, updatedAt)`; tombstones-in-place (`favourited: false`) propagate unfavourites. Last-write-wins per row on `updatedAt`. Backed by a new `tUserFavouriteTag` table (migration `0008_concerned_snowbird`). The block is additive and optional — older clients are unaffected.

  **Native KMP:** favourite tag state moves out of `SettingsStorage` into Room (`FavouriteTagEntity`, DB v5). Toggling a favourite chip in the filter sheet now schedules a debounced (2 s) auto-sync; subsequent syncs LWW-merge per row against the server, so pinned chips reappear on reinstall or a second device. No user-facing UI changes beyond cross-device persistence.

- 5071abb: Add native and reader diagnostics through the AO3 Tracker service, with a saved Privacy setting to disable diagnostic collection and crash reports.

  Keep development and production diagnostics separate, exclude reading content and account details from usage events, and pause usage collection during incognito reading.

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

- e524c4a: Harden the API against the risks surfaced in the codebase review:

  - **Backups** are no longer handed out as public, unauthenticated R2 bucket
    URLs. `GET /api/backup/:workId` now returns a relative `downloadPath` instead
    of `url`, and a new authenticated `GET /api/backup/:workId/file/:filename`
    route streams the object from R2 after an ownership (`isUserTrackingWork`)
    check. The unused `WORK_BACKUPS_BUCKET_URL` var is removed. NOTE: the R2
    bucket's public custom domain should also be disabled at the infrastructure
    level so objects are only reachable through this authenticated route.
  - **Rate limiting** added on all `/api/*` routes (per-user, via the Cloudflare
    `ratelimit` binding `API_RATE_LIMITER`), with a stricter limit on the
    outbound AO3-proxy routes (`/api/parse/*` and backup creation) via
    `AO3_PROXY_RATE_LIMITER`.
  - **CORS** is no longer a wildcard: it now reflects only origins in the new
    `ALLOWED_ORIGINS` env var.
  - **Better Auth** `trustedOrigins` is now configured from `ALLOWED_ORIGINS`,
    and the origin/CSRF check is only disabled for the `local` environment
    (previously also disabled on the publicly-routed `dev` deployment).
  - **Auth email logs** no longer record recipient email addresses (PII); they
    log the user id instead.
  - **Queue handler** now processes every message in a batch instead of returning
    after the first (previously dropped notifications 2..N).
  - **Delivery retries** now run independently per device. Transient FCM failures
    retry and exhausted attempts go to the configured dead-letter queue; expired
    tokens are parsed from the response and invalidated.
  - **Partial backups** retry missing formats even when another format already
    has a current backup.

  Notes:

  - The `GET /api/backup/:workId` field rename (`url` → `downloadPath`) is a wire
    change but no shipped client consumes the backup endpoints, so this is
    released as a `minor` rather than `major` bump.
  - `/api/parse/*` remains an authenticated AO3 fetch proxy open to any tracked
    account (not gated on tracking a specific work) — this is intentional to
    support previewing a work before tracking it; abuse is now bounded by the
    `AO3_PROXY_RATE_LIMITER` (30/min/user).
  - `ALLOWED_ORIGINS` feeds both CORS and Better Auth `trustedOrigins` and includes
    the stable unpublished Chrome extension identity. A fixed Firefox development
    UUID is allowed in local/dev only; signed Firefox distribution needs an
    authentication origin strategy before publication.

### Patch Changes

- 1618091: Add separate Android Dev and Chrome Beta builds that use the development API.

  Release the beta clients after successful dev CI and API deployment. The Android Dev app installs alongside production; the Chrome Beta item uses its own store identity and permits only the dev API. Production release behavior remains unchanged.

- 0e7f0f1: Use the Chrome Web Store public key for extension ID `hjonebiohecalkggemeneaaohafldkkl` and allow its exact authentication origin in every API environment. Retain the previous development origin for existing unpacked installs. Deploy the API origin configuration before releasing this extension build.
- febe900: Fix native passkey registration and sign-in by preserving challenge cookies, sending credential responses as JSON objects, and retaining the selected API environment throughout authentication.

  Validate Android passkeys against configured signing-certificate origins and keep those certificates aligned with Digital Asset Links, including the separate development app. Declare the app's credential associations in each Android build variant and check them during Android lint. Deploy the API update before releasing the native client.

  Remove server selection from production native builds and ignore saved development-server choices. Keep selection available in development builds, returning to the build's default server when Dev Mode is disabled.

- e524c4a: Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

  Upgrade Drizzle ORM and Kit to 1.0.0-rc.4, migrate the PlanetScale client and relational queries, and use Drizzle's built-in Zod schema generation. Keep the PlanetScale driver on the compatible 1.x line. Report migration failures with their underlying causes while redacting connection credentials.

  Convert migration files to timestamped folders without changing historical SQL. The deployment check supports both legacy and RC migration ledgers and remains read-only. The first manual RC migration run adds and backfills the ledger's `name` and `applied_at` columns before applying pending SQL; review pending migrations and use PlanetScale's schema-change process before running it.

  Apply API migration `20260930103837_auth-two-factor-lockout` (formerly `0012`) before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.

- 1bd631b: Local dev now runs through [portless](https://github.com/vercel-labs/portless): `pnpm dev` serves the API at `https://ao3tracker.localhost` instead of `http://localhost:8787`. Wrangler is pinned to port 8787 via `--app-port`. The cloudflared tunnel (`pnpm proxy`) now forwards `qcksys-ao3tracker-api-local.ta2.dev` to `ao3tracker.localhost` so external traffic also goes through the portless proxy.
- ad0ec6b: Use a consistent book-and-bookmark app logo, with a gold Beta badge on beta extension and Android Dev builds. Remove the extension's unused active-tab permission.

  Publish a public privacy policy for the browser extension and its synchronization service.

- Updated dependencies [25eabd5]
- Updated dependencies [e524c4a]
- Updated dependencies [5071abb]
- Updated dependencies [e524c4a]
  - @qcksys/ao3tracker-core@0.1.0
