# @qcksys/ao3tracker-native-kmp

## 0.2.0

### Minor Changes

- 1618091: Add separate Android Dev and Chrome Beta builds that use the development API.

  Release the beta clients after successful dev CI and API deployment. The Android Dev app installs alongside production; the Chrome Beta item uses its own store identity and permits only the dev API. Production release behavior remains unchanged.

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

  Retry failed notification queue submissions from persisted pending records, including when no further work update occurs. Apply `20261002000754_notification-dispatch-outbox` before deploying this API; existing notification history is excluded from retries. Align Android background notification taps and channels, initialize notification storage before background callbacks, preserve the device push token across sign-out, and recover tokens erased by earlier versions before registration.

  Organize Settings in both clients into compact, expandable sections with visible status summaries. Keep account controls at the top and API/developer options under Advanced. Group native reading controls together and make library management and app information easier to find.

- 61991a6: Add an option to open AO3 HTTPS links in the Android app through the system's supported-link settings. Preserve the linked chapter, search query, and fragment when opening the reader.

  Add Copy and Open in browser actions when long-pressing links in the Android reader. Copy the full link URL and open links in an external browser even when AO3 links are assigned to the app.

  Add a persistent Incognito mode that pauses automatic work, chapter, and reading-progress tracking on this device. Show a paused indicator in the reader, discard queued activity across mode changes, and resume tracking the current page when Incognito is turned off. Existing library sync and explicit library edits remain available.

- e9628d6: Favourite tag filters now sync across devices.

  **API:** `/api/track/sync` gains an optional `favouriteTags` block in both directions (GET response and POST request/response). Per-row `(tagType, tag, favourited, updatedAt)`; tombstones-in-place (`favourited: false`) propagate unfavourites. Last-write-wins per row on `updatedAt`. Backed by a new `tUserFavouriteTag` table (migration `0008_concerned_snowbird`). The block is additive and optional — older clients are unaffected.

  **Native KMP:** favourite tag state moves out of `SettingsStorage` into Room (`FavouriteTagEntity`, DB v5). Toggling a favourite chip in the filter sheet now schedules a debounced (2 s) auto-sync; subsequent syncs LWW-merge per row against the server, so pinned chips reappear on reinstall or a second device. No user-facing UI changes beyond cross-device persistence.

- e524c4a: Add saved searches: name and save an AO3 filter/search URL from a "Save this search" button injected on AO3 list pages, then open, rename, or delete them later. Saved searches sync across devices via `/api/track/sync` (new optional `savedSearches` array, per-row LWW keyed by a client-generated uuid, tombstone deletes) backed by a new `user_saved_search` table.

  - **Browser extension**: on-page save button + a new "Searches" popup tab to open/rename/delete.
  - **Native (KMP)**: on-page save button in the WebView with a naming dialog (Read tab), and a saved-searches bottom sheet to open/rename/delete (Track tab); new `saved_search` Room table (DB v6) + repository + sync wiring.

  Fix cross-device synchronization and local data safety:

  - Isolate each account and API environment, preserving its local data and pending edits when switching accounts. Native Room DB v8 stores each account and guest in a separate database file and migrates existing data automatically.
  - Add a native Settings action to copy guest works, progress, favourite tags and saved searches into the signed-in account. Preserve existing account entries and the guest library, and keep imported data ready for sync. Signing out keeps local account data for the next sign-in.
  - Preserve edits made during GET/POST requests, acknowledge only uploaded versions, merge partial tag metadata, and retain the first pagination watermark.
  - Use server mutation timestamps with bounded replay for incremental sync, atomic last-write-wins updates, and persistent deletion tombstones. Apply API migration `0011_sync-mutation-cursors` before deploying the new server.
  - Preserve native deletions during metadata refresh, synchronize mark-unread resets, use server values on timestamp ties, and clear local data only after a successful sync with no intervening edits.
  - Report the chapter identified in the page DOM when tracking scroll progress on a work's root URL.
  - Restore a deleted extension work when reading resumes, while retaining deletion for flag-only edits.
  - Batch native favourite tags and saved searches at the API's 500-row limit, including uploads containing only those collections.
  - Preserve chapter-zero tombstones when single-chapter works gain real chapter IDs, and reconcile later legacy uploads without duplicating progress.

- 1bd631b: Filter sheet improvements:

  - Add a "Favourites" section at the top of the filter sheet that lists every favourited tag across all tag types. Tapping a chip cycles its filter mode against the underlying per-type filter map; long-press unfavourites.
  - Sync favourite-tag toggles to the server immediately instead of debouncing 2s, so the change reaches other devices straight away.
  - Fix overlapping tag chips when sections wrap (`FlowRow` `verticalArrangement` was `spacedBy(-8.dp)`; now `spacedBy(8.dp)`).

- 4bd52df: Show the first fandom on tracked work cards and compact the Track screen to fit more cards.

  Split reading progress into chapter segments so unread chapters stay blank in their actual positions, with partial reads shown within each segment. Refresh cards when chapter progress or fandom tags change.

### Patch Changes

- febe900: Fix native passkey registration and sign-in by preserving challenge cookies, sending credential responses as JSON objects, and retaining the selected API environment throughout authentication.

  Validate Android passkeys against configured signing-certificate origins and keep those certificates aligned with Digital Asset Links, including the separate development app. Deploy the API update before releasing the native client.

- e524c4a: Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

  Upgrade Drizzle ORM and Kit to 1.0.0-rc.4, migrate the PlanetScale client and relational queries, and use Drizzle's built-in Zod schema generation. Keep the PlanetScale driver on the compatible 1.x line. Report migration failures with their underlying causes while redacting connection credentials.

  Convert migration files to timestamped folders without changing historical SQL. The deployment check supports both legacy and RC migration ledgers and remains read-only. The first manual RC migration run adds and backfills the ledger's `name` and `applied_at` columns before applying pending SQL; review pending migrations and use PlanetScale's schema-change process before running it.

  Apply API migration `20260930103837_auth-two-factor-lockout` (formerly `0012`) before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.

- ad0ec6b: Use a consistent book-and-bookmark app logo, with a gold Beta badge on beta extension and Android Dev builds. Remove the extension's unused active-tab permission.

  Publish a public privacy policy for the browser extension and its synchronization service.

- e524c4a: Harden Android and iOS WebViews: restrict navigation, script injection, and bridge messages to trusted AO3 pages and frames.
