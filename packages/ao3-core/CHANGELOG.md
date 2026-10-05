# @qcksys/ao3tracker-core

## 0.3.0

### Minor Changes

- 08c0606: Add an optional Hide all tracked works setting to collapse tracked works in AO3 lists, including unread works and works with new chapters. Keep a Show action to reveal individual works on the current page.
- b28f74e: Read saved AO3 chapters offline on Android with your selected site skin and reading position. Downloads are off by default. Save whole works explicitly, or enable automatic saving and choose how many upcoming chapters to prefetch, including all. Manage downloads from Works and a separate Offline reading settings section.

  Preserve custom, inherited and replacement site skins across restarts. Keep downloads separate for each account, protect explicit saves from automatic storage cleanup, and sync offline reading progress when connected. Whole-work links offer a choice of saved chapters.

  Continue downloads when switching apps or locking the phone, refresh saved chapters when AO3 publishes a newer download, and optionally remove completed automatic saves while retaining whole-work downloads. Tap download progress for troubleshooting details.

  Fix downloads failing with "The loaded page contains more than one chapter" by opening individual chapters before capture, including when AO3 is configured to display entire works.

### Patch Changes

- 71b1569: Open automatically selected next chapters at the top of the chapter body instead of above it. Preserve saved reading positions when resuming chapters already in progress.

## 0.2.0

### Minor Changes

- 7964092: Add an "Update saved search to match" option when saving an AO3 search. Choose an existing saved search to replace its filters while keeping its name, or save a new search. Updates sync across devices.

  Show saved-search names across the full width, with the first five tags and a count of additional tags underneath. Move actions below the content to keep names readable in both clients.

- fe279ed: Keep hidden work titles clickable and move hidden-work management into a separate searchable screen. Show excluded tags as removable chips.

  Add an optional setting to collapse caught-up and finished works in AO3 lists, with the reason shown and new chapters kept visible. Calculate reading percentages and chapter progress bars using published chapters rather than planned totals.

- 9ffbe51: Reduce saved-search checks to recent updates and retain activity counts until the search is opened. Fix a crash when opening the Searches tab.

  Start with a small baseline, cap routine checks at ten pages, resume partial results on the next refresh, and pause checks when AO3 limits requests. Offer an explicit full scan for older changes.

### Patch Changes

- Mark chapters 100% read as soon as the bottom Next Chapter button is visible, including short chapters that fit on screen without scrolling. Preserve completed progress when scrolling back up.

  Open the next chapter from the start when the last-read chapter is finished. Apply the same reading position to Works links, notification taps, and native notification history, while preserving progress when no next chapter is available.

  Preserve cleared chapter read status when reopening the native reader by restoring the scroll position before tracking progress and avoiding automatic completion of the previously open chapter. Remove the chapter delete action from Work Details.

- 8e9d240: Store the full work summary up to 2,048 characters, including all paragraphs and text around inline formatting. Exclude chapter summaries from the work summary.

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

### Patch Changes

- e524c4a: Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

  Upgrade Drizzle ORM and Kit to 1.0.0-rc.4, migrate the PlanetScale client and relational queries, and use Drizzle's built-in Zod schema generation. Keep the PlanetScale driver on the compatible 1.x line. Report migration failures with their underlying causes while redacting connection credentials.

  Convert migration files to timestamped folders without changing historical SQL. The deployment check supports both legacy and RC migration ledgers and remains read-only. The first manual RC migration run adds and backfills the ledger's `name` and `applied_at` columns before applying pending SQL; review pending migrations and use PlanetScale's schema-change process before running it.

  Apply API migration `20260930103837_auth-two-factor-lockout` (formerly `0012`) before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.
