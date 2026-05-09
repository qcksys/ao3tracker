# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `SettingsStorage` - Preferences storage
- `CredentialHelper` - Credential management
- `Ao3WebView` - WebView component

**Screen Models**: Voyager `ScreenModel` classes manage screen state. Some are singletons to preserve state across tab switches (`ReadScreenModel`, `TrackScreenModel`).

**HTTP Client**: Ktor with Bearer token authentication. `AuthService` owns the `HttpClient` instance, which is shared with `SyncService` for session continuity. API base URLs are configurable via `AppSettings` (defaults in `build.gradle.kts`).

### WebView Integration
The app embeds AO3 in a WebView and injects JavaScript to:
- Extract work metadata, chapters, and tags
- Track scroll progress
- Communicate via `WebViewMessage` JSON protocol

TypeScript source is in `webview-scripts/src/`. The Gradle build compiles and embeds these scripts as Kotlin string constants.

### Data Flow
1. WebView JS extracts AO3 page data → sends JSON message to native
2. Native parses `WebViewMessage` → `Ao3Repository` persists to Room database
3. UI observes Room `Flow`s for reactive updates
4. `SyncService` synchronizes local data with remote API

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
