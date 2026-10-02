# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `apps/browser-extension/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

AO3 Tracker browser extension. Cross-device tracking for Archive of Our Own: a content script extracts work metadata + scroll progress on AO3 pages, the background worker persists the data and syncs it with the [api](../api/AGENTS.md), and the popup surfaces auth/current-work/favourites. Targets Chrome and Firefox (Manifest V3 via WXT).

## Commands

All commands run from `apps/browser-extension/`:

```bash
vp run dev                # WXT dev server (Chrome)
vp run dev:firefox        # WXT dev server (Firefox)
vp run build              # Production build (Chrome)
vp run build:firefox      # Production build (Firefox)
vp run zip                # Bundle a release zip (Chrome)
vp run zip:firefox        # Bundle a release zip (Firefox)
vp run compile            # tsc --noEmit (type check only)
vp run test               # sync/account regressions under Vitest (Node)
```

`vp install` runs `wxt prepare` as a postinstall hook to regenerate `.wxt/` types.

### Chrome Web Store releases

The workflow's `channel` selects `production` (default) or `beta`. Production uploads remain drafts; beta uploads submit for review without cancelling an existing review. `Release dev` calls the beta channel after deploying the dev API. Build a bootstrap ZIP with `vp run zip -b chrome --mode beta`: the name is **AO3 Tracker Beta**, API default and allowed hosts use only the dev API plus AO3, and outputs have a `-beta` suffix. Its separate item can coexist with production.

Create the beta listing once, then set repository variables `CHROME_BETA_EXTENSION_ID` and `CHROME_BETA_PUBLIC_KEY` from its Package page. The key is public manifest identity, not a credential. The dev API build uses the same item ID to allow its exact auth origin; production ignores it. Beta uploads check the manifest identity and the live dev API preflight response before authentication. The initial build-only ZIP may omit the key until the store assigns the new identity.

The [release-chrome workflow](../../.github/workflows/release-chrome.yml) type-checks and tests the shared packages and extension, builds only the Chrome ZIP, and saves it as an artifact before store access. It uses WXT's Chrome Web Store v2 service-account support. Set `build_only=true` for the first listing ZIP or a build without store access. The GitHub environment is `chrome-web-store`, with secret `CHROME_SERVICE_ACCOUNT_JSON` and variables `CHROME_PUBLISHER_ID` and `CHROME_EXTENSION_ID`. The service account must be linked to the publisher in the Chrome Developer Dashboard and have the Chrome Web Store API enabled in its Google Cloud project.

The [Chrome Web Store listing](https://chrome.google.com/webstore/devconsole/c77f78ba-195c-49ce-be7b-cb99ce8dc629/hjonebiohecalkggemeneaaohafldkkl/edit) has item ID `hjonebiohecalkggemeneaaohafldkkl`; its public key is in `wxt.config.ts`. Obtain `CHROME_PUBLISHER_ID` from Publisher → Settings in the Developer Dashboard. Deploy the matching dev/prod API `ALLOWED_ORIGINS` before uploading a release. [scripts/release-chrome.mjs](../../scripts/release-chrome.mjs) rejects mismatched keys/IDs and missing configured origins. It checks repository configuration, not the deployed API. Complete the store listing/privacy details and submit for review manually in the dashboard when ready. See [store-releases.md](../../docs/store-releases.md) when configuring or retrying releases.

Release automation sets `CHROME_VERSION` and optionally `CHROME_VERSION_NAME`. WXT applies them only to Chrome builds: the numeric version must have 1–4 canonical integer components from 0 to 65535, with at least one nonzero component; the optional display name must be nonempty and fit on one line. The display name requires a numeric override. Both unset leaves ordinary builds on the package version. ZIP filenames use the generated manifest version. Uploads must use a version greater than the last uploaded package; increment the package version when building a release without overrides.

The Google auth action creates a temporary credentials file; the wrapper passes its email/private key to WXT only through the child process environment. Never commit `.env.submit` or `gha-creds-*.json`. Release-script tests run with `node --test scripts/release-chrome.test.mjs` from the repository root.

## Architecture

### Stack

- **WXT** ([wxt.config.ts](wxt.config.ts)) — Manifest V3 extension framework. Handles manifest generation, dev reload, cross-browser builds. WXT polyfills the `browser.*` API for Firefox.
- **React 19 + react-router 7** — popup UI, using `HashRouter` (file:// URLs in extension contexts don't play well with `BrowserRouter`).
- **Tailwind 4** via `@tailwindcss/vite` plugin. Tokens live inline in [entrypoints/popup/style.css](entrypoints/popup/style.css).
- **shadcn/ui — Base UI variant** ([components.json](components.json) `style: base-vega`). Primitives ship from `@base-ui/react` (not Radix). Components live in [components/ui/](components/ui/).
- **react-hook-form + zod** for forms. Form components in [components/ui/form.tsx](components/ui/form.tsx).
- **@wxt-dev/storage** for persistent state (typed wrapper over `chrome.storage.local`).

### Shared packages

- [`@qcksys/ao3tracker-core`](../../packages/ao3-core) — AO3 DOM extraction + zod wire schemas. Used by both the content script and (in a different IIFE form) the native KMP app's webview-scripts. Always import via subpaths (`/dom`, `/badges`, `/schemas`) to keep bundles small.
- [`@qcksys/ao3tracker-sync-client`](../../packages/ao3-sync-client) — typed `fetch` wrapper around `/api/track/sync`, Better Auth flows, and the per-row LWW merge for favourite tags.

### Entrypoints

WXT discovers entrypoints from [entrypoints/](entrypoints/):

- [entrypoints/background.ts](entrypoints/background.ts) — service worker. Owns auth tokens, periodic sync (alarm every 5 min), debounced sync after page events, and message routing.
- [entrypoints/content.ts](entrypoints/content.ts) — content script. Matches `https://archiveofourown.org/*`. Calls into `@qcksys/ao3tracker-core/dom` to extract work info/tags/chapters/scroll and posts `WebViewMessage` payloads to the background. On list pages, requests badge data and renders chips via `@qcksys/ao3tracker-core/badges`.
- [entrypoints/popup/](entrypoints/popup/) — toolbar popup React app. Entry: [main.tsx](entrypoints/popup/main.tsx) → [App.tsx](entrypoints/popup/App.tsx).

### Local libs ([lib/](lib/))

- [messaging.ts](lib/messaging.ts) — zod-validated discriminated unions for content↔background and popup↔background messages.
- [storage.ts](lib/storage.ts) — typed `storage.defineItem(...)` records for auth, tracked works/chapters, metadata, favourite tags.
- [account-state.ts](lib/account-state.ts) — verifies bearer-session identity, archives/restores local data by account and API endpoint, and invalidates in-flight syncs when the identity changes. Unidentified legacy data is retained separately and never assigned to a different account.
- [local-state.ts](lib/local-state.ts) — background mutation queue shared by page events, popup edits, account transitions, and sync commits. Network requests run outside this queue.
- [tracker-repo.ts](lib/tracker-repo.ts) — local mirror of the native app's `Ao3Repository`. Ingests page events, computes badge data, exposes the "current work" summary for the popup.
- [favourite-tags-repo.ts](lib/favourite-tags-repo.ts) — toggle/apply remote with LWW merge.
- [saved-searches-repo.ts](lib/saved-searches-repo.ts) — save/rename/delete (tombstone) named search URLs + apply remote with LWW merge (`mergeSavedSearches`, id-keyed).
- [sync.ts](lib/sync.ts) — `runSync()`: pull `getFullSync`, merge into local, push pending rows, persist `serverLastUpdated`. Notification polling runs on the same alarm.
- [notifications.ts](lib/notifications.ts) applies this browser's saved master/category preferences before showing alerts. Use the shared `@qcksys/ao3tracker-core/notifications` schema for preference fields. Preserve the legacy disabled toggle when upgrading storage. Poll and advance the account's notification cursor even when alerts are muted so consumed notifications are not replayed when re-enabled. Preferences stay local when switching accounts; they are not part of account sync.

### Manifest

Generated by WXT from [wxt.config.ts](wxt.config.ts). Permissions: `storage`, `alarms`, `notifications`. Production host permissions cover AO3 and the prod/dev API endpoints; development also permits the local/proxy endpoints. Add new permissions there, not in a raw `manifest.json`.

The store public key fixes the unpacked and Web Store Chrome ID as `hjonebiohecalkggemeneaaohafldkkl`. The previous development ID `blgkokkfdhkkgaghemkodncmjfjbpjdc` remains in the API allowlist for existing installs; changing the unpacked ID creates a separate browser storage namespace, so sync the old install before replacing it. The Firefox add-on ID is `ao3tracker@qcksys.com`; WXT's development profile maps it to runtime UUID `9f7fd2ce-5e43-4d3e-9d4e-92f89126df55`. The API trusts that exact Firefox development origin only in local/dev environments. Firefox assigns other runtime UUIDs to ordinary installs, so a signed Firefox release requires a hosted authentication flow or another explicit origin strategy before publication. Changing these identities requires matching API auth-origin configuration.

### Aliases

- `~popup` → `./entrypoints/popup` (declared in [wxt.config.ts](wxt.config.ts))
- `@` and `~` → browser-extension root (auto-generated by WXT in `.wxt/tsconfig.json`)

### Popup routes (HashRouter)

| Path                  | Component           | Notes                                                                                                       |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/`                   | `Tracker`           | Default. Shows current work + sync controls when signed in, otherwise prompts sign-in.                      |
| `/searches`           | `Searches`          | Saved AO3 filter URLs — open in a new tab, rename, delete. Saved via the on-page "Save this search" button. |
| `/lists`              | `Lists`             | Favourite-tag chips grouped by type.                                                                        |
| `/settings`           | `Settings`          | Account controls, expandable Search preferences, Notifications and Advanced (API environment) sections.     |
| `/login`, `/register` | `Login`, `Register` | react-hook-form + zod, talks to Better Auth via the sync client.                                            |

### Sync flow

1. Content script posts `pageEvent` for every work/scroll change.
2. Background ingests via `tracker-repo.ingestPageEvent`, marks affected rows `pendingSync = true`, and debounces a sync 2 s later. Fresh work-info or scroll activity restores a deleted work with a reading timestamp newer than its tombstone; changing a favourite/subscription flag alone preserves deletion.
3. `runSync()` pulls `/sync` (paginated), then merges against the latest local state under the mutation queue. Reading fields use `lastReadAt`; favourite/subscription flags use their independent timestamps (explicit timestamps beat missing ones, remote wins ties). It pushes pending rows in batches of 50 works, with parent works included for pending chapters, including chapter tombstones (`deleted: true`). Each POST acknowledges only the exact local versions it sent. The cursor is the first GET page's server mutation watermark, not a reading timestamp. Full GETs include tombstones so the one-time cursor migration does not resurrect deleted work.
4. Favourite-tag rows are LWW-merged with `mergeFavouriteTags`. Explicit local `pendingSync` flags preserve unsent changes independently of the server cursor. Missing flags on legacy rows are retried once; remote rows win ties. Per-row tables batch at 500 rows. Chapter-zero migration tombstones also use the original reading timestamp: keep newer offline zero events pending so the API can merge them into the real first chapter.
5. Saved-search rows use `saveSearch` messages (origin-gated to AO3), persist through `saved-searches-repo`, and LWW-merge with `mergeSavedSearches` (id-keyed). The content script requests live search URLs in `getBrowsingState` and watches storage changes; the shared DOM helper shows a disabled "Saved search" button for a matching URL, ignoring pagination and parameter order. `suggestSavedSearchName` supplies the editable default from applied filters, excluding pagination, counts, and result blurbs; keep it shared with the native WebView.
6. Auth tokens change only through the background's `setAuthSession` message. Account/endpoint switches archive unsent changes, restore only that identity's data, and invalidate old sync responses. Logged-out data stays in its own endpoint-specific archive. Tag metadata is replaced per returned work, retaining unrelated works' cached tags.

**Search preferences**: Settings edits device-local `browsingPreferencesItem` (`hiddenWorkIds`, `hiddenTags`, `languageFilterEnabled`, `searchLanguage`), outside account sync. Background mutations use `withLocalState`; message schemas derive from the shared browsing schemas. `@qcksys/ao3tracker-core/dom` adds tag defaults to AO3 work/bookmark GET searches while preserving explicit exclusions, and collapses hidden works with an Unhide action. Tag and work lists start empty and remain when accounts change. Language filtering starts disabled with English selected; when enabled, it replaces language filters in work/bookmark URLs and GET forms, including saved searches. The popup uses the shared `/languages` catalog.

## Conventions

- **Browser API**: use `browser.*` (WXT's cross-browser shim) inside extension code, not `chrome.*` directly — keeps Firefox builds working.
- **Storage**: prefer `@wxt-dev/storage`'s typed `storage.defineItem(...)` pattern over raw `chrome.storage` calls. All storage records are declared in [lib/storage.ts](lib/storage.ts).
- **Messaging**: every message in/out of the background worker must round-trip through a zod schema declared in [lib/messaging.ts](lib/messaging.ts). The background validates incoming, the popup helper validates outgoing responses. No bare `chrome.runtime.sendMessage` without a schema.
- **shadcn/Base UI**: components in [components/ui/](components/ui/) use `@base-ui/react` primitives (not `@radix-ui`). The Base UI button does NOT support `asChild` — use `buttonVariants(...)` on a router `Link` for navigation buttons, or pass `render={<Link to="..." />}` to the underlying primitive directly.
- **Content-script matches**: keep `matches` patterns as narrow as possible. Currently `https://archiveofourown.org/*`.
- **Tests**: `vp run test` runs Node Vitest regressions against the actual repositories and sync transport with in-memory extension storage and controlled fetch responses. Shared DOM/wire behavior is also tested in `packages/ao3-core` and `packages/ao3-sync-client`.

## Cross-app contract

This extension consumes the API at `https://ao3tracker.com` ([apps/api/AGENTS.md](../api/AGENTS.md)). The wire schemas in `@qcksys/ao3tracker-core/schemas` mirror those in [apps/api/src/routes/api.track.ts](../api/src/routes/api.track.ts) — when the server contract changes, update both the api routes AND the schemas package in the same PR.

The native KMP app ([apps/native-kmp/AGENTS.md](../native-kmp/AGENTS.md)) consumes the same DOM extraction + sync wire schemas via the shared workspace packages. Cross-platform changes to the WebViewMessage protocol or badge status enum need to land in `packages/ao3-core` and be verified against the native Kotlin code's `WorkBadgePayload` / `WebViewMessage` types.

`scrollProgress.chapterId` is optional and nullable for older clients; current extractors populate it from the URL or AO3 chapter selector. Receivers prefer this identity and fall back to URL parsing, so `/works/{id}` pages update the actual first chapter.
