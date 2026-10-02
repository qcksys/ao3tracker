# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in this repository. Read this before making changes — there is no root `CLAUDE.md`; this file is authoritative.

## Project Overview

AO3 Tracker is a Kotlin Multiplatform (KMP) application for tracking reading progress on Archive of Our Own (AO3). It targets Android, iOS, and Desktop (JVM) platforms using Compose Multiplatform for the UI.

## Build Commands

### Android

```shell
./gradlew :composeApp:assembleDebug          # Debug build
./gradlew :composeApp:assembleRelease        # Release APK (unsigned unless signing env is set)
./gradlew :composeApp:bundleRelease          # Release AAB for Play Store
./gradlew :composeApp:bundleDev              # Separate AO3 Tracker Dev AAB
```

### Google Play releases

The workflow's `channel` selects `production` (default) or `beta`. `Release dev` calls it with `beta` after successful dev API deployment when native inputs changed since a successful automatic Android release. Beta builds use the release-derived `dev` build type, package `com.qcksys.ao3tracker.dev`, name **AO3 Tracker Dev**, and a `-dev` version suffix. They install alongside production and have separate local storage. Fresh installs use the dev auth and sync endpoints through the platform-specific `defaultApiEnvironment()`; an explicit saved Settings selection still takes precedence. Production, iOS, and JVM defaults remain production.

Server selection is available only in Android debug/dev builds and iOS debug binaries. Android release, iOS release, and JVM builds use production and ignore previously saved server selections, including when the runtime Dev Mode switch is enabled. Keep `AppSettings.canSelectApiEnvironment` enforced in storage loading, updates, and Settings UI. Turning off Dev Mode restores the build's default server when selection is supported.

The dev Firebase Android registration is in project `qs-ao3tracker`; its public client config is `composeApp/src/dev/google-services.json`. The Google Services plugin selects it by build type. The separate Play app needs its own initial signed AAB upload, tester list, and service-account access. Signing and publishing reuse the existing GitHub secrets; the workflow always uses the internal track for either package.

The [Android release workflow](../../.github/workflows/release-android.yml) runs automatically after successful `main`/`dev` CI and the corresponding API deployment, or manually, using the `google-play` GitHub environment. Automatic callers pass `ci_verified: true` to reuse the shared AO3 core, WebView, and JVM test results for the exact source commit; manual releases and callers without that flag run those tests. It produces a signed AAB and R8 mapping artifact. Uploads target only `internal` testing, with release status `completed` by default or `draft` when selected manually. Choose `build_only` to download the bundle without uploading it. For a new Play listing, upload that signed artifact manually once before using API publishing.

Configure environment secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. API publishing also requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, whose service account must have access to `com.qcksys.ao3tracker` in Play Console. Use the existing upload key registered with Play; do not replace it or commit keystore/credential files. The workflow decodes credentials only into runner temporary storage and removes them on exit. It restores native CI Gradle caches to reuse matching task outputs, keeps the configuration cache and daemon disabled, and never uploads Gradle caches after signing. See [release caching](../../docs/store-releases.md) for cache selection and rebuild behavior.

Each release job generates fresh `ANDROID_VERSION_CODE` and `ANDROID_VERSION_NAME` values, including failed-job retries. Store uploads share a concurrency lock; automatic runs use the exact successful CI SHA and reject superseded commits. See [release versioning and setup](../../docs/store-releases.md) for the timestamp scheme and external prerequisites. Local overrides still require codes from 1 through 2100000000 and names in `1.2.3` form, optionally with prerelease/build suffixes, up to 128 characters. Without overrides, local builds retain code `20` and name `0.1.0`; Changesets do not update these Android values.

For local signing, supply all four variables: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. A relative keystore path is resolved from `apps/native-kmp/`. Partial configuration fails, and release builds never use the debug key as a fallback. Use `--no-configuration-cache --no-build-cache --no-daemon` for a signed local release to avoid retaining credentials in Gradle configuration state. With no signing variables, local release builds remain unsigned.

CI validation sets `APP_BUILD_TIME_UTC=2020-01-01 00:00:00 UTC` so generated common Kotlin metadata remains stable and compilation can reuse cached outputs. Local and signed store builds leave the override unset to record the actual build time. Ordinary native PRs run JVM tests and Debug; Gradle/dependency/ProGuard changes, the `ci:android-minify` label and manual CI also build the minified Dev APK. Push releases validate minification with the signed AAB. See [CI selection and caching](../../docs/store-releases.md) for history-based gating.

### Desktop (JVM)

```shell
./gradlew :composeApp:run                             # Run desktop app
./gradlew :composeApp:packageDistributionForCurrentOS # Create installer
```

### iOS

Open `iosApp/` directory in Xcode and run from there.

### Tests

```shell
./gradlew :composeApp:jvmTest                                  # Run all tests
./gradlew :composeApp:jvmTest --tests "*WebViewMessageTest*"   # Run specific test class
```

For an Android smoke test, build `:composeApp:assembleDebug`, select an existing emulator or connected device with `adb devices -l`, and update the app without removing its data:

```shell
adb -s <device> install -r -t composeApp/build/outputs/apk/debug/composeApp-debug.apk
adb -s <device> shell am start -W -n com.qcksys.ao3tracker/.MainActivity
```

Check the Read, Works, Searches, and Settings tabs, AO3 WebView loading, and `adb logcat` for app crashes. JVM tests cover shared repository and database behavior; they do not replace Android UI testing. iOS builds and simulator tests require macOS and Xcode.

### WebView Scripts

TypeScript code in `webview-scripts/` compiles to minified IIFE JavaScript injected into WebViews. The package is a workspace member managed through Vite+. It pulls AO3 DOM-extraction logic from `@qcksys/ao3tracker-core` so the same code runs in the browser extension and the native WebView.

Auto-compiled during Gradle builds, but can be built manually:

```shell
cd webview-scripts && vp run build       # Build minified IIFE JS via vp build (vite library mode)
cd webview-scripts && vp run typecheck   # TypeScript type checking only
cd webview-scripts && vp run test        # vp test run (vitest, happy-dom)
cd webview-scripts && vp run biome:ci    # Lint
```

The Gradle build invokes `vp install --frozen-lockfile` at the **workspace root** (`../..`) before running `vp run build` in `webview-scripts/` — this is required so the `workspace:*` link to `@qcksys/ao3tracker-core` resolves. Install Vite+ and expose `vp` on the Gradle process's PATH. See [composeApp/build.gradle.kts](composeApp/build.gradle.kts) (`vpInstall` and `compileWebviewScripts` tasks).

Compiled JS is converted to Kotlin string constants in `build/generated/kotlin/webview/`.

## Architecture

### Source Set Structure

- `commonMain/` - Shared Kotlin code for all platforms
- `androidMain/` - Android-specific implementations
- `iosMain/` - iOS-specific implementations
- `jvmMain/` - Desktop JVM-specific implementations
- `commonTest/` - Shared tests

### Key Architectural Patterns

**Dependency Injection**: Koin is used for DI. All dependencies are configured in `di/AppModule.kt`.

**Navigation**: Voyager library handles navigation with Read, Works, Searches, and Settings tabs (`ReadTab`, `TrackTab`, `SearchesTab`, `SettingsTab`). Works remains the initial tab. `MainScreen` is the root navigator.

**Settings layout**: Keep account controls visible at the top. Reading, Search preferences, Sync, Notifications (supported platforms), Library & data, About, and Advanced use expandable `SettingsSection` cards with status summaries. Expansion is saved across tab switches and configuration changes. Keep ongoing operations and their state outside the collapsible content so closing a section does not cancel saves. Android supported-link controls live under Reading.

**Database**: Room database with KSP for code generation. Schema files are in `composeApp/schemas/`. Entities: `WorkEntity`, `ChapterEntity`, `TagEntity`, `FavouriteTagEntity`. When modifying the schema:

1. Update entity classes in `data/database/Entities.kt`
2. Increment database version in `Ao3Database.kt`
3. Add migration in `Migrations.kt` and register it in `AppModule.kt`

**Platform Abstractions**: Use `expect/actual` pattern for platform-specific code:

- `DatabaseFactory` - Database instantiation
- `TokenStorage` - Secure token storage
- `SettingsStorage` - Device preferences storage (API env, dev mode, last sync timestamp, auto-sync-on-open, incognito mode, notification preferences)

- `CredentialHelper` - Credential management
- `Ao3WebView` - WebView component (takes an optional `jsInjectionFlow: SharedFlow<String>` for native→JS evaluation, and `onBackAtRoot` for back-gesture handling when the WebView has no history)

**Notification preferences**: Settings offers a master switch and per-type choices for new chapters, completed, restricted, and deleted works. `AppSettings` persists these device-wide choices through `SettingsStorage`. `PushRepository` serializes registration and preference changes, sends preferences with every `/api/push/token` registration, and persists a change only after the API confirms it when a signed-in device has a token. Signed-out or tokenless devices save locally for their next registration. Keep the Kotlin JSON names aligned with `@qcksys/ao3tracker-core/notifications`; the API filters delivery per token, including background alerts and retries. Android also checks local preferences for foreground alerts. Deploy the API's `20261001231352_device-notification-preferences` migration and registration response before releasing the native client. Desktop push remains unsupported. Android's `Application` initializes push/settings storage and the notification channel before background callbacks. Signing out unregisters the account's device association but preserves its FCM token for the next sign-in. Background taps use channel `ao3_work_updates`, action `com.qcksys.ao3tracker.OPEN_WORK`, and a string `workId`; local notifications also accept the existing Long `work_id` extra.

**Screen Models**: Voyager `ScreenModel` classes manage screen state. `ReadScreenModel`, `TrackScreenModel`, and `SearchesScreenModel` are singletons to preserve state across tab switches — see [AppModule.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/di/AppModule.kt).

**Cross-tab navigation**: `NavigationState` (singleton in `ui/navigation/`) exposes a `pendingNavigation` `StateFlow` that any screen can set. `MainScreen` observes it and switches to the Read tab; `ReadScreen` consumes the request. Works cards, notification deep links, and notification history use `navigateToWork`; `ReadScreenModel` resolves the active account's latest saved reading position. A completed chapter (`Chapter.isComplete`) opens the next numbered, live chapter at zero scroll when available; otherwise it retains the current chapter and progress. Keep this rule aligned with the extension's `workReadingUrl`. Explicit chapter selections retain their requested destination. External Android `ACTION_VIEW` links use `navigateToExternalAo3Url`, validate the trusted AO3 HTTPS origin, and use a null scroll position to preserve the full URL and fragment. The activity uses `singleTop` and handles both startup and `onNewIntent`. Settings exposes Android's supported-link screen; users must approve the bare and `www` AO3 domains manually because AO3 does not host this app's Digital Asset Links association. This option is Android-only.

**HTTP Client**: Ktor with Bearer token authentication. `AuthService` owns the `HttpClient` instance, which is shared with `SyncService` for session continuity. API base URLs are configurable via `AppSettings` (defaults in `build.gradle.kts`). Passkey verification sends a JSON object and the captured API origin, retaining only the signed passkey challenge cookie between requests. Session cookies stay excluded so bearer/account changes remain authoritative. Options and verification use the same captured API environment. The API validates assertion origins against its configured web origins and Android certificate hashes; update the API's shared certificate configuration when signing identities change.

**Account databases**: Room version 8 gives each account (API environment + user ID) and the signed-out guest a separate database file. `AccountDataStore` uses `ao3tracker.db` as a registry with UUID filenames in `account_database`; it copies legacy active rows or version 7 archives into each destination once, including pending edits, tombstones and sync cursors. The destination `active_account` row is the migration completion marker; keep it when clearing data so old rows are never restored. The legacy database remains as a recovery source. Only a verified stored session may claim an unowned legacy database; ordinary sign-in leaves it with guest. Bind reactive queries through `AccountDataStore.observe` and multi-query reads through `read` so account changes switch the complete query to the correct file. Route local mutations through `AccountDataStore.edit` and sync merges/acknowledgements through `forAccount`; network calls stay outside its mutex. Sync captures the account generation and token so stale requests cannot alter a replacement account. Auth responses must match the captured operation generation and API environment before accepting a session.

**Guest import**: Settings offers an explicit copy into the verified signed-in account. Import live guest works with their chapters and tags, favourite tags and saved searches in one destination transaction. Existing account IDs (including tombstones) win; an existing work and all its chapters stay unchanged. Preserve guest data and original reading/conflict timestamps, advance imported work/chapter row timestamps for incremental upload, and mark imported favourites/searches pending. Imports check the captured session before committing and count as local edits so sync-and-clear cannot discard them.

**Sync cursors**: Keep the first GET page's `serverLastUpdated` as the account's remote cursor, used only for subsequent GETs. The server deliberately overlaps its cursor by 16 minutes to include delayed commits. Local push selection uses the separate local sync-start timestamp. Favourite and saved-search acknowledgements match the exact submitted timestamp and values; newer local edits stay pending. Equal row timestamps use the server value. Mark-unread writes zero progress with a fresh `lastReadAt`; incoming newer or equal reading events replace work privacy/completion and chapter progress/completion, including null resets. Subscribed/favourite timestamps advance even when values match; when both timestamps are absent, use the reading clock. Full GET includes work/chapter tombstones; their `lastReadAt` orders deletes and restores, with server winning ties. POST chapters carry optional `deleted` (default false). Server metadata preserves local tombstones and replaces each returned work's tag set, including empty sets. `sync(forceFull = true, clearOnSuccess = true)` clears only after success and refuses if local edits occurred during the upload.

Sync uploads batch at most 50 works, 500 favourite tags and 500 saved searches per request. Extra per-row batches can contain no works. A failed batch keeps the captured changes pending for retry; successful uploads acknowledge only the exact captured versions. When the API replaces chapter zero with a real chapter ID, it returns a zero tombstone at the original reading timestamp; retain any newer offline zero event so the API can merge it into the first chapter.

### WebView Integration

The app embeds AO3 in a WebView and injects JavaScript to:

- Extract work metadata, chapters, and tags
- Track scroll progress through shared `observeChapterProgress` on load, scroll, resize, and bottom Next Chapter button visibility changes. Any visible part of that bottom button reports 100%; the top navigation link does not. Automatic progress retains the highest recorded value.
- Communicate via `WebViewMessage` JSON protocol
- Render per-work tracker badges on AO3 list pages (round-trip: see "List-page badges" below)

TypeScript source is in `webview-scripts/src/`. The script imports its DOM extraction helpers from `@qcksys/ao3tracker-core/dom` and badge rendering from `@qcksys/ao3tracker-core/badges` — both subpath imports avoid pulling zod into the IIFE bundle (which would balloon it to ~330 kB). The Gradle build compiles and embeds these scripts as Kotlin string constants. The TS exposes a few functions on `window.__ao3Tracker` so native code can invoke them via `evaluateJavaScript` (currently: `applyListBadges` and `reportReadingActivity`).

**Native→JS injection channel**: `ReadScreenModel.jsInjectionFlow` is a `SharedFlow<String>` of JS source strings. The `Ao3WebView` actuals collect from it and call `evaluateJavascript`/`evaluateJavaScript`. Use `ReadScreenModel.jsStringLiteral(...)` when embedding user-controlled text inside an injected script — it escapes `\`, `'`, newlines, and the U+2028/U+2029 line-terminators that would otherwise break a JS string literal.

**WebView trust**: `TrustedAo3Origin.kt` permits HTTPS on `archiveofourown.org` and `www.archiveofourown.org`, using the default HTTPS port. iOS checks the sending frame's security origin and requires the main frame; navigation and injected responses use the same allowlist. Retain the JavaScript origin check around responses because navigation can occur after a native URL check. Scroll messages carry the optional extracted `chapterId`, matching work-info extraction; older messages fall back to the URL.

**Incognito mode**: `AppSettings` persists this device preference on Android, iOS, and JVM. It pauses automatic work/tag/chapter writes, reading progress, and automatic chapter completion; it does not clear browser cookies/history or disable existing-library sync and explicit saved-search/library actions. `ReadScreenModel` captures a tracking generation when each bridge message arrives and resets metadata/previous-chapter caches between generations. Automatic repository writes pass their session guard through `AccountDataStore.edit`, which checks inside the transaction before and after the write so cancelled sessions roll back. Turning tracking back on requests a fresh current-page snapshot with `window.__ao3Tracker.reportReadingActivity()` rather than replaying buffered incognito events. Keep the reader's paused banner visible while enabled.

### Diagnostics

`DiagnosticsClient` sends allowlisted usage events and warning/error counts through the selected API origin's `POST /ingest`. The WebView uses the native bridge (`diagnostic` messages), never a direct PostHog request. The shared wire schema lives in `@qcksys/ao3tracker-core/diagnostics`; use a type-only import in WebView scripts to avoid bundling Zod. See the [Worker contract](../api/AGENTS.md#native-diagnostics) before changing events or configuration.

Settings → Privacy → Send diagnostic data defaults on and persists through `SettingsStorage`. It controls both PostHog and Sentry, including startup initialization. Incognito additionally suppresses PostHog. Consent/environment changes invalidate queued events, cancel pending sends and rotate the anonymous session ID. The bounded queue is memory-only with no retries or disk persistence. Never include work IDs, reading content, URLs, search terms, account identity or raw log/error text in PostHog events. Sentry remains responsible for crash details. Session replay, autocapture, Sentry automatic sessions and failed-request capture are disabled.

Native sends `window.__ao3Tracker.setDiagnosticsEnabled(boolean)` after `browsingReady` and whenever consent changes. WebView collection starts disabled; preserve its controller across reinjection and keep the native consent check authoritative. Regression tests cover opt-out, restart persistence, environment changes, incognito, bridge filtering and repeated injection.

### Data Flow

1. WebView JS extracts AO3 page data → sends JSON message to native
2. Native parses `WebViewMessage` → `Ao3Repository` persists to Room database
3. UI observes Room `Flow`s for reactive updates
4. `SyncCoordinator` runs `SyncRepository`, which synchronizes Room with the remote API through `SyncService`.

**Sync execution**: route manual, full, startup, favourite and saved-search sync through the singleton [SyncCoordinator](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/sync/SyncCoordinator.kt). Screens request work and observe its progress, result and sign-out state. The coordinator owns the coroutine scope and serializes requests, so leaving a screen or cancelling an awaiting caller preserves the job. `requestSignOut()` owns full sync, local clearing, push unregistration and sign-out together. Requests capture the session and account generation; cleanup checks them again inside the auth and push locks to protect replacement accounts. This is in-process execution; OS termination can interrupt it. Keep lifecycle, queued-account-change and cleanup regressions in `SyncCoordinatorTest`.

### List-page badges

When the WebView loads an AO3 list page (anything with `<li id="work_{id}">` blurbs):

1. `ao3-tracking.ts` calls `findListWorkIds()` and posts a `listWorks` message with the visible IDs.
2. `ReadScreenModel.handleListWorks` calls `Ao3Repository.getWorkBadges(workIds)` to build `WorkBadgePayload`s (status derived from chapter progress; possible statuses are `not-started`, `in-progress`, `caught-up`, `finished`, `has-new-chapters`, `private`).
3. The model emits a JS injection string to `jsInjectionFlow`. The WebView evaluates it, calling `window.__ao3Tracker.applyListBadges(payloadJson)`.
4. `applyListBadges` renders an absolutely-positioned `.ao3-tracker-badge` element inside each blurb.

The status string set MUST stay in sync between `WorkBadgePayload` (Kotlin) and `WorkBadgeData` (TypeScript, defined in [`packages/ao3-core/src/badges.ts`](../../packages/ao3-core/src/badges.ts)) — any new status needs an entry in `formatBadge`'s `switch` and a clause in `buildBadgePayload`. The same status set is consumed by the browser extension's content script.

### Reader link actions

Android link long-presses open a Material 3 action sheet using the app theme. `ReaderLink` classifies trusted AO3 work/tag URLs and decodes AO3 tag escapes. Copy and Open in browser retain the complete URL; linked images resolve their anchor with `requestFocusNodeHref`. Text selection and editable-field menus remain native. `ReadScreenModel.handleLinkAction` adds works without navigating or creating chapter progress, or updates the existing device-local hidden tags/works. Explicit actions work in incognito. Adding an existing work preserves its metadata and progress; restoring a deleted work advances its sync reading clock. Account-generation checks guard queued tracking actions.

### Favourite tag filters

Long-pressing a tag chip in the filter sheet pins it to the top of its section. State lives in [FavouriteTagRepository](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/repository/FavouriteTagRepository.kt) on top of a Room table (`FavouriteTagEntity` in [Entities.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Entities.kt)). The UI consumes `observeFavourites(): Flow<Set<String>>` where each entry is `"${tagType.id}\t$tag"` (tab-separated, matches the historical format).

**Tombstones in place**: unfavouriting writes `favourited = false` rather than deleting the row, so concurrent unfavourites propagate to other devices via LWW.

**Cross-device sync**: each row has its own `updatedAt`; sync is via the per-row `favouriteTags` block on `/api/track/sync` (see [api/AGENTS.md](../api/AGENTS.md)). Rows with local changes have `pendingSync = true` and are pushed on the next sync; the server LWW-merges and `FavouriteTagRepository.applyRemote` LWW-merges incoming rows locally. Server wins on tie.

**Auto-sync trigger**: toggling a favourite calls `SyncTriggers.notifyFavouriteChanged()`, which submits a silent request to `SyncCoordinator`. Saved-search edits use the same coordinator through `notifySavedSearchChanged()`.

### Saved searches

Named AO3 filter/search URLs the user pinned, synced across devices via the per-row `savedSearches` block on `/api/track/sync` (see [api/AGENTS.md](../api/AGENTS.md), backed by the `user_saved_search` table). Mirrors the favourite-tag stack, keyed by a client-generated uuid (so renames/deletes converge).

**Storage**: [SavedSearchEntity](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Entities.kt) (table `saved_search`, DB version 6, [MIGRATION_5_6](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Migrations.kt)) + [SavedSearchDao](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Daos.kt). Logic in [SavedSearchRepository](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/repository/SavedSearchRepository.kt).

**Tombstones in place**: deleting sets `deleted = true` (not a row removal), so concurrent deletes propagate via LWW on `updatedAt`. Live set is `WHERE deleted = 0`; push set is `WHERE pendingSync = 1`. Server wins on tie.

**Wire**: `savedSearches` fields on the `Sync*` DTOs in [Sync.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/model/Sync.kt); captured first-page-only, applied via `SavedSearchRepository.applyRemote`, and pushed on the first POST batch — all in [SyncRepository.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/sync/SyncRepository.kt). Auto-sync on local edits via `SyncTriggers.notifySavedSearchChanged()`.

**Create/update (Read tab)**: the WebView uses the shared `injectSaveSearchButton` helper. It shows "Saved search" and disables saving when the current filters match a live saved URL, ignoring pagination and parameter order. Otherwise, clicking "Save this search" posts `saveSearch` and `ReadScreenModel` opens a dialog to name a new search or choose a live saved search to update to the current URL. Updates preserve its ID and name, advance `updatedAt`, mark it pending, and trigger sync. Missing/deleted selections and account changes reject the update. `suggestSavedSearchName` supplies the editable default from applied filters, excluding pagination, counts, and result blurbs; keep it shared with the extension. Live saved-search changes refresh the label through `applyBrowsingState`.

**Search preferences**: `AppSettings.browsingPreferences` persists device-local `hiddenWorkIds`, `hiddenWorkTitles`, `hiddenTags`, `hideCaughtUp`, `languageFilterEnabled`, `searchLanguage`, and nullable `maxFandoms` through all three `SettingsStorage` implementations, independently of account sync. Hidden works and tags start empty. Language filtering starts disabled with English selected. Settings edits default tag exclusions and restores hidden works. On each page, the WebView posts `browsingReady` even when there are no results; native sends `{ hiddenWorkIds, hiddenTags, savedSearchUrls, languageFilterEnabled, searchLanguage, maxFandoms, hideCaughtUp }` through `applyBrowsingState`, guarded by the requesting page URL. Changes to preferences or live saved searches refresh that payload. The `setWorkHidden` bridge message carries `{ url, workId, hidden, title? }`; explicit hiding remains available in incognito. Shared DOM helpers merge default tags into AO3 work/bookmark GET searches, enforce the enabled language filter (including saved searches), and collapse hidden work blurbs with an Unhide action. Always serialize both language fields in `BrowsingState`, even when they match preference defaults. Gradle generates `Ao3Languages` from the shared core language catalog. These preferences affect AO3 browsing; they do not delete tracked works or their reading progress. Excluded tags use removable chips. Settings has its own Voyager stack; the hidden-work count opens a searchable screen with title links and Unhide. Titles are captured when hiding (including link actions), with library-title/ID fallback for older entries. `hideCaughtUp` defaults off and collapses caught-up/finished AO3 blurbs through shared DOM code, independently of manual hiding. Badges include published `currentChapters` so newer AO3 results remain visible. Work reading percentages and chapter bars exclude planned and deleted chapters.

**Manage (Searches tab)**: [SearchesScreen](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/ui/screens/searches/SearchesScreen.kt) lists saved searches — tap to open in the Read tab (via `NavigationState.navigateToRead`), copy the link, or rename/delete. Copy writes the full stored URL to the platform clipboard and confirms success without editing or syncing the search. `SearchesScreenModel` observes the live searches and triggers sync after edits. Saved searches are separate from the Works tab's work filters and sorting.

**Local search checks (Android/iOS)**: opening Searches checks searches without a successful or capped attempt in the last five minutes; per-search and Check all controls allow manual refresh. Checks run sequentially in a separate WebView with existing AO3 cookies and reading-tracker scripts disabled. Normal checks establish a one-page baseline, then query recent work revisions with a one-day date overlap and a ten-page cap. Counts are deduplicated and retained until the search is opened; "newly found" means absent from the local snapshot, not necessarily newly published. Capped results are labelled partial and save the next page URL locally, so another refresh resumes instead of repeating the same pages. They retain the previous successful start timestamp until the final chunk completes, then advance it to the first chunk's start time. Failed and cancelled checks preserve stored results. Explicit full scans read every page; the first full scan establishes coverage of older works without counting them as new. Both modes apply hidden tags/works, language and fandom limits; context changes establish a fresh baseline. A 429/503 response pauses the queue and manual checks for Retry-After, with a five-minute fallback. Leaving Searches cancels checks. Room v10 stores snapshots, pending work IDs and view/attempt timestamps locally; the migration retains v9 snapshots and resets counts that lack work IDs. This state is excluded from sync, guest imports and account migration snapshots. Checks and opening a search must not change saved-search sync timestamps, pending flags, sync cursors, or trigger sync/notifications. Desktop lacks the WebView needed for checks.

## Key Dependencies

- Compose Multiplatform (UI) with Hot Reload plugin
- Room (database with KSP)
- Koin (DI)
- Voyager (navigation)
- Ktor (HTTP client)
- Kotlinx Serialization (JSON)
- Napier (logging)
- Coil (image loading)
- Sentry (error tracking)

Dependency versions are pinned in `gradle/libs.versions.toml`. Keep AGP on 8.13.2 and Gradle on 8.14.5 while Android and shared KMP code use one module. Compose 1.11.1, Lifecycle 2.10.0, Coil 3.5.0, and Ktor 3.5.2 are compatible upgrades for this build: newer releases require Android API 37 or AGP 9.1, whose KMP migration needs a separate Android app module. Do not bypass their AAR compatibility checks. Firebase Messaging uses its supported main module; the discontinued `firebase-messaging-ktx` artifact must not be restored.

Kotlin 2.4 requires [R8 9.1.29 or newer](https://developer.android.com/build/kotlin-support). `settings.gradle.kts` uses the [supported R8 override](https://r8.googlesource.com/r8/+/refs/heads/main/README.md#replacing-r8-in-android-gradle-plugin) to pin 9.1.56 without migrating AGP. `gradle.properties` separately selects Lint 9.4.1 with Google's [newer Lint override](https://googlesamples.github.io/android-custom-lint-rules/usage/newer-lint.md.html). Validate these pins with a minified release bundle and its release lint tasks; debug builds alone do not exercise Kotlin metadata rewriting.

## Configuration

- API base URLs are set in `composeApp/build.gradle.kts` under `buildConfigField`
- Android Credential Manager reads the manifest's `asset_statements` resource. Production includes the production association URL; debug/dev resources include development and local URLs. Keep `CredManMissingDal` enabled. The selected relying-party hostname must resolve publicly and serve `/.well-known/assetlinks.json` as HTTP 200 JSON, without redirects. Its package and SHA-256 fingerprints must match the installed app, including the **Play app signing certificate**, which can differ from the upload certificate. The API's shared certificate list also controls accepted Android passkey origins. The dev package is associated only with non-production APIs.
- ProGuard rules for release builds are in `composeApp/proguard-rules.pro`

Crossover preferences: `maxFandoms` is a positive integer or `null` (no limit, including existing installs). A value of 1 injects `work_search[crossover]=F` into work-search URLs and GET forms; AO3 bookmark searches do not support that parameter. `applyFandomLimit` hides work/bookmark blurbs whose `.fandoms a.tag` count exceeds the limit, independently of manually hidden works, and restores them when relaxed or cleared. Saved-search matching includes the effective crossover filter. Native saved-search checks use the same limit on every page and include it in their baseline context. Native serialization omits a cleared `maxFandoms`; shared helpers treat either an absent or null value as unlimited.
