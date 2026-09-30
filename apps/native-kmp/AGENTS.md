# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in this repository. Read this before making changes — there is no root `CLAUDE.md`; this file is authoritative.

## Project Overview

AO3 Tracker is a Kotlin Multiplatform (KMP) application for tracking reading progress on Archive of Our Own (AO3). It targets Android, iOS, and Desktop (JVM) platforms using Compose Multiplatform for the UI.

## Build Commands

### Android

```shell
./gradlew :composeApp:assembleDebug          # Debug build
./gradlew :composeApp:assembleRelease        # Release APK (unsigned)
./gradlew :composeApp:bundleRelease          # Release AAB for Play Store
```

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

Check the Read, Track, and Settings tabs, AO3 WebView loading, and `adb logcat` for app crashes. JVM tests cover shared repository and database behavior; they do not replace Android UI testing. iOS builds and simulator tests require macOS and Xcode.

### WebView Scripts

TypeScript code in `webview-scripts/` compiles to minified IIFE JavaScript injected into WebViews. The package is a pnpm workspace member (formerly bun-based; migrated). It pulls AO3 DOM-extraction logic from `@qcksys/ao3tracker-core` so the same code runs in the browser extension and the native WebView.

Auto-compiled during Gradle builds, but can be built manually:

```shell
cd webview-scripts && pnpm run build       # Build minified IIFE JS via vp build (vite library mode)
cd webview-scripts && pnpm run typecheck   # TypeScript type checking only
cd webview-scripts && pnpm run test        # vp test run (vitest, happy-dom)
cd webview-scripts && pnpm run biome:ci    # Lint
```

The Gradle build invokes `pnpm install` at the **workspace root** (`../..`) before running `pnpm run build` in `webview-scripts/` — this is required so the `workspace:*` link to `@qcksys/ao3tracker-core` resolves. See [composeApp/build.gradle.kts](composeApp/build.gradle.kts) (`pnpmInstall` and `compileWebviewScripts` tasks).

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

**Navigation**: Voyager library handles navigation with a tab-based structure (`ReadTab`, `TrackTab`, `SettingsTab`). `MainScreen` is the root navigator.

**Database**: Room database with KSP for code generation. Schema files are in `composeApp/schemas/`. Entities: `WorkEntity`, `ChapterEntity`, `TagEntity`, `FavouriteTagEntity`. When modifying the schema:

1. Update entity classes in `data/database/Entities.kt`
2. Increment database version in `Ao3Database.kt`
3. Add migration in `Migrations.kt` and register it in `AppModule.kt`

**Platform Abstractions**: Use `expect/actual` pattern for platform-specific code:

- `DatabaseFactory` - Database instantiation
- `TokenStorage` - Secure token storage
- `SettingsStorage` - Preferences storage (API env, dev mode, last sync timestamp, auto-sync-on-open, incognito mode)
- `CredentialHelper` - Credential management
- `Ao3WebView` - WebView component (takes an optional `jsInjectionFlow: SharedFlow<String>` for native→JS evaluation, and `onBackAtRoot` for back-gesture handling when the WebView has no history)

**Screen Models**: Voyager `ScreenModel` classes manage screen state. Some are singletons to preserve state across tab switches (`ReadScreenModel`, `TrackScreenModel`). `TrackScreenModel` takes `SettingsStorage` directly (not via `singleOf`, since the constructor has 3 deps) — see [AppModule.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/di/AppModule.kt).

**Cross-tab navigation**: `NavigationState` (singleton in `ui/navigation/`) exposes a `pendingNavigation` `StateFlow` that any screen can set. `MainScreen` observes it and switches to the Read tab; `ReadScreen` consumes the URL+scroll. Notification deep links (from `MainActivity.handleNavigationIntent`) and the "open in reader" action from Track include a scroll position. External Android `ACTION_VIEW` links use `navigateToExternalAo3Url`, validate the trusted AO3 HTTPS origin, and use a null scroll position to preserve the full URL and fragment. The activity uses `singleTop` and handles both startup and `onNewIntent`. Settings exposes Android's supported-link screen; users must approve the bare and `www` AO3 domains manually because AO3 does not host this app's Digital Asset Links association. This option is Android-only.

**HTTP Client**: Ktor with Bearer token authentication. `AuthService` owns the `HttpClient` instance, which is shared with `SyncService` for session continuity. API base URLs are configurable via `AppSettings` (defaults in `build.gradle.kts`).

**Account isolation**: Room version 7 adds `active_account` and `account_archive`. `AccountDataStore` archives the outgoing account's complete local rows (including pending edits and tombstones) and restores the incoming account in one transaction. Account keys include the API environment; signed-out guest rows are separate. A verified stored session can claim a legacy database with no owner. Version 7 starts with a fresh remote cursor instead of reusing the old event-time cursor from preferences. Route local mutations through `AccountDataStore.edit` and sync merges/acknowledgements through `forAccount`; network calls stay outside its mutex. Sync captures the account generation and token so stale requests cannot alter a replacement account. Auth responses must match the captured operation generation and API environment before accepting a session.

**Sync cursors**: Keep the first GET page's `serverLastUpdated` as the account's remote cursor, used only for subsequent GETs. The server deliberately overlaps its cursor by 16 minutes to include delayed commits. Local push selection uses the separate local sync-start timestamp. Favourite and saved-search acknowledgements match the exact submitted timestamp and values; newer local edits stay pending. Equal row timestamps use the server value. Mark-unread writes zero progress with a fresh `lastReadAt`; incoming newer or equal reading events replace work privacy/completion and chapter progress/completion, including null resets. Subscribed/favourite timestamps advance even when values match; when both timestamps are absent, use the reading clock. Full GET includes work/chapter tombstones; their `lastReadAt` orders deletes and restores, with server winning ties. POST chapters carry optional `deleted` (default false). Server metadata preserves local tombstones and replaces each returned work's tag set, including empty sets. `sync(forceFull = true, clearOnSuccess = true)` clears only after success and refuses if local edits occurred during the upload.

### WebView Integration

The app embeds AO3 in a WebView and injects JavaScript to:

- Extract work metadata, chapters, and tags
- Track scroll progress
- Communicate via `WebViewMessage` JSON protocol
- Render per-work tracker badges on AO3 list pages (round-trip: see "List-page badges" below)

TypeScript source is in `webview-scripts/src/`. The script imports its DOM extraction helpers from `@qcksys/ao3tracker-core/dom` and badge rendering from `@qcksys/ao3tracker-core/badges` — both subpath imports avoid pulling zod into the IIFE bundle (which would balloon it to ~330 kB). The Gradle build compiles and embeds these scripts as Kotlin string constants. The TS exposes a few functions on `window.__ao3Tracker` so native code can invoke them via `evaluateJavaScript` (currently: `applyListBadges` and `reportReadingActivity`).

**Native→JS injection channel**: `ReadScreenModel.jsInjectionFlow` is a `SharedFlow<String>` of JS source strings. The `Ao3WebView` actuals collect from it and call `evaluateJavascript`/`evaluateJavaScript`. Use `ReadScreenModel.jsStringLiteral(...)` when embedding user-controlled text inside an injected script — it escapes `\`, `'`, newlines, and the U+2028/U+2029 line-terminators that would otherwise break a JS string literal.

**WebView trust**: `TrustedAo3Origin.kt` permits HTTPS on `archiveofourown.org` and `www.archiveofourown.org`, using the default HTTPS port. iOS checks the sending frame's security origin and requires the main frame; navigation and injected responses use the same allowlist. Retain the JavaScript origin check around responses because navigation can occur after a native URL check. Scroll messages carry the optional extracted `chapterId`, matching work-info extraction; older messages fall back to the URL.

**Incognito mode**: `AppSettings` persists this device preference on Android, iOS, and JVM. It pauses automatic work/tag/chapter writes, reading progress, and automatic chapter completion; it does not clear browser cookies/history or disable existing-library sync and explicit saved-search/library actions. `ReadScreenModel` captures a tracking generation when each bridge message arrives and resets metadata/previous-chapter caches between generations. Automatic repository writes pass their session guard through `AccountDataStore.edit`, which checks inside the transaction before and after the write so cancelled sessions roll back. Turning tracking back on requests a fresh current-page snapshot with `window.__ao3Tracker.reportReadingActivity()` rather than replaying buffered incognito events. Keep the reader's paused banner visible while enabled.

### Data Flow

1. WebView JS extracts AO3 page data → sends JSON message to native
2. Native parses `WebViewMessage` → `Ao3Repository` persists to Room database
3. UI observes Room `Flow`s for reactive updates
4. `SyncService` synchronizes local data with remote API

### List-page badges

When the WebView loads an AO3 list page (anything with `<li id="work_{id}">` blurbs):

1. `ao3-tracking.ts` calls `findListWorkIds()` and posts a `listWorks` message with the visible IDs.
2. `ReadScreenModel.handleListWorks` calls `Ao3Repository.getWorkBadges(workIds)` to build `WorkBadgePayload`s (status derived from chapter progress; possible statuses are `not-started`, `in-progress`, `caught-up`, `finished`, `has-new-chapters`, `private`).
3. The model emits a JS injection string to `jsInjectionFlow`. The WebView evaluates it, calling `window.__ao3Tracker.applyListBadges(payloadJson)`.
4. `applyListBadges` renders an absolutely-positioned `.ao3-tracker-badge` element inside each blurb.

The status string set MUST stay in sync between `WorkBadgePayload` (Kotlin) and `WorkBadgeData` (TypeScript, defined in [`packages/ao3-core/src/badges.ts`](../../packages/ao3-core/src/badges.ts)) — any new status needs an entry in `formatBadge`'s `switch` and a clause in `buildBadgePayload`. The same status set is consumed by the browser extension's content script.

### Favourite tag filters

Long-pressing a tag chip in the filter sheet pins it to the top of its section. State lives in [FavouriteTagRepository](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/repository/FavouriteTagRepository.kt) on top of a Room table (`FavouriteTagEntity` in [Entities.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Entities.kt)). The UI consumes `observeFavourites(): Flow<Set<String>>` where each entry is `"${tagType.id}\t$tag"` (tab-separated, matches the historical format).

**Tombstones in place**: unfavouriting writes `favourited = false` rather than deleting the row, so concurrent unfavourites propagate to other devices via LWW.

**Cross-device sync**: each row has its own `updatedAt`; sync is via the per-row `favouriteTags` block on `/api/track/sync` (see [api/AGENTS.md](../api/AGENTS.md)). Rows with local changes have `pendingSync = true` and are pushed on the next sync; the server LWW-merges and `FavouriteTagRepository.applyRemote` LWW-merges incoming rows locally. Server wins on tie.

**Auto-sync trigger**: toggling a favourite calls `SyncTriggers.notifyFavouriteChanged()`, which fires `SyncRepository.sync()` straight away. Implemented in [SyncTriggers.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/sync/SyncTriggers.kt). `SyncTriggers` is a `createdAtStart = true` Koin singleton so the subscriber is wired before the first user action.

### Saved searches

Named AO3 filter/search URLs the user pinned, synced across devices via the per-row `savedSearches` block on `/api/track/sync` (see [api/AGENTS.md](../api/AGENTS.md), backed by the `user_saved_search` table). Mirrors the favourite-tag stack, keyed by a client-generated uuid (so renames/deletes converge).

**Storage**: [SavedSearchEntity](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Entities.kt) (table `saved_search`, DB version 6, [MIGRATION_5_6](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Migrations.kt)) + [SavedSearchDao](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/database/Daos.kt). Logic in [SavedSearchRepository](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/repository/SavedSearchRepository.kt).

**Tombstones in place**: deleting sets `deleted = true` (not a row removal), so concurrent deletes propagate via LWW on `updatedAt`. Live set is `WHERE deleted = 0`; push set is `WHERE pendingSync = 1`. Server wins on tie.

**Wire**: `savedSearches` fields on the `Sync*` DTOs in [Sync.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/model/Sync.kt); captured first-page-only, applied via `SavedSearchRepository.applyRemote`, and pushed on the first POST batch — all in [SyncRepository.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/data/sync/SyncRepository.kt). Auto-sync on local edits via `SyncTriggers.notifySavedSearchChanged()`.

**Create (Read tab)**: the WebView injects a "Save this search" button on AO3 list pages (`injectSaveSearchButton` from `@qcksys/ao3tracker-core/dom`, wired in [webview-scripts/src/ao3-tracking.ts](webview-scripts/src/ao3-tracking.ts)). Clicking posts a `saveSearch` bridge message (`SaveSearchMessage` in `@qcksys/ao3tracker-core/schemas`); [ReadScreenModel](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/ui/screens/read/ReadScreenModel.kt) surfaces a naming dialog in [ReadScreen](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/ui/screens/read/ReadScreen.kt).

**Manage (Track tab)**: a bookmark action in the top bar opens a saved-searches bottom sheet ([TrackScreen](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/ui/screens/track/TrackScreen.kt)) — tap to open in the Read tab (via `NavigationState.navigateToRead`), or rename/delete.

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

## Configuration

- API base URLs are set in `composeApp/build.gradle.kts` under `buildConfigField`
- ProGuard rules for release builds are in `composeApp/proguard-rules.pro`
