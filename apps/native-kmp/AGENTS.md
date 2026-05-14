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

### WebView Scripts
TypeScript code in `webview-scripts/` compiles to JavaScript injected into WebViews. Auto-compiled during Gradle builds, but can be built manually:
```shell
cd webview-scripts && bun run build       # Build minified JS
cd webview-scripts && bun run typecheck   # TypeScript type checking only
cd webview-scripts && bun run test        # vitest (happy-dom)
cd webview-scripts && bun run biome:ci    # Lint
```
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

**Database**: Room database with KSP for code generation. Schema files are in `composeApp/schemas/`. Entities: `WorkEntity`, `ChapterEntity`, `TagEntity`. When modifying the schema:
1. Update entity classes in `data/database/Entities.kt`
2. Increment database version in `Ao3Database.kt`
3. Add migration in `Migrations.kt` and register it in `AppModule.kt`

**Platform Abstractions**: Use `expect/actual` pattern for platform-specific code:
- `DatabaseFactory` - Database instantiation
- `TokenStorage` - Secure token storage
- `SettingsStorage` - Preferences storage (incl. favourite tag filters, persisted newline-delimited as `"typeId\ttag"` entries)
- `CredentialHelper` - Credential management
- `Ao3WebView` - WebView component (takes an optional `jsInjectionFlow: SharedFlow<String>` for native→JS evaluation, and `onBackAtRoot` for back-gesture handling when the WebView has no history)

**Screen Models**: Voyager `ScreenModel` classes manage screen state. Some are singletons to preserve state across tab switches (`ReadScreenModel`, `TrackScreenModel`). `TrackScreenModel` takes `SettingsStorage` directly (not via `singleOf`, since the constructor has 3 deps) — see [AppModule.kt](composeApp/src/commonMain/kotlin/com/qcksys/ao3tracker/di/AppModule.kt).

**Cross-tab navigation**: `NavigationState` (singleton in `ui/navigation/`) exposes a `pendingNavigation` `StateFlow` that any screen can set. `MainScreen` observes it and switches to the Read tab; `ReadScreen` consumes the URL+scroll. This is how notification deep links (from `MainActivity.handleNotificationIntent`) and the "open in reader" action from the Track tab both flow.

**HTTP Client**: Ktor with Bearer token authentication. `AuthService` owns the `HttpClient` instance, which is shared with `SyncService` for session continuity. API base URLs are configurable via `AppSettings` (defaults in `build.gradle.kts`).

### WebView Integration
The app embeds AO3 in a WebView and injects JavaScript to:
- Extract work metadata, chapters, and tags
- Track scroll progress
- Communicate via `WebViewMessage` JSON protocol
- Render per-work tracker badges on AO3 list pages (round-trip: see "List-page badges" below)

TypeScript source is in `webview-scripts/src/`. The Gradle build compiles and embeds these scripts as Kotlin string constants. The TS exposes a few functions on `window.__ao3Tracker` so native code can invoke them via `evaluateJavaScript` (currently: `applyListBadges`).

**Native→JS injection channel**: `ReadScreenModel.jsInjectionFlow` is a `SharedFlow<String>` of JS source strings. The `Ao3WebView` actuals collect from it and call `evaluateJavascript`/`evaluateJavaScript`. Use `ReadScreenModel.jsStringLiteral(...)` when embedding user-controlled text inside an injected script — it escapes `\`, `'`, newlines, and the U+2028/U+2029 line-terminators that would otherwise break a JS string literal.

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

The status string set MUST stay in sync between `WorkBadgePayload` (Kotlin) and `WorkBadgeData` (TypeScript) — any new status needs an entry in `formatBadge`'s `switch` and a clause in `buildBadgePayload`.

### Favourite tag filters
Long-pressing a tag chip in the filter sheet pins it to the top of its section. State lives in `TrackScreenModel.favouriteTagFilters` (`StateFlow<Set<String>>`), persisted via `SettingsStorage.{get,set}FavouriteTagFilters`. Keys are `"${tagType.id}\t$tag"` — using a tab separator so it can never collide with characters AO3 allows in tags. The storage encodes the set as newline-delimited values (newlines are likewise impossible in AO3 tags).

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

## Configuration
- API base URLs are set in `composeApp/build.gradle.kts` under `buildConfigField`
- ProGuard rules for release builds are in `composeApp/proguard-rules.pro`
