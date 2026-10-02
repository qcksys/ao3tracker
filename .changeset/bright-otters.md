---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-browser-extension": minor
"@qcksys/ao3tracker-native-kmp": minor
"@qcksys/ao3tracker-core": minor
---

Bring the browser extension closer to feature-parity with the native app, and tighten the API's email flows.

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

Show the installed native app version, build number where available, and UTC build time in About.
