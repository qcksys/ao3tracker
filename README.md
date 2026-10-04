# AO3 Tracker

Track reading progress on Archive of Our Own (AO3) and sync it between a browser extension and a native app. This monorepo contains the clients, their shared AO3 parsing and sync packages, and the Cloudflare Workers API.

- Track works, chapters, and reading position while browsing AO3.
- Sync reading progress, favourites, subscriptions, favourite tags, and saved searches across devices.
- Receive work-update notifications and create backups through the API.
- Download chapters for offline reading on Android, preserving AO3 site skins and syncing reading progress when connected again.

The extension targets Chrome and Firefox. The Kotlin Multiplatform app targets Android, iOS, and desktop (JVM); desktop currently has no embedded AO3 reader. See the [offline reading documentation](docs/native-offline-reading.md) for Android download behaviour and platform limits.

## Repository layout

| Path                                                  | Purpose                                             | Main technologies                                                 |
| ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| [apps/api](apps/api/)                                 | Authentication, sync, work updates, and backups     | Cloudflare Workers, Hono, Drizzle, PlanetScale MySQL, Better Auth |
| [apps/browser-extension](apps/browser-extension/)     | AO3 page tracking and browser popup                 | WXT, React, Tailwind CSS, shadcn/ui                               |
| [apps/native-kmp](apps/native-kmp/)                   | Android, iOS, and desktop app                       | Kotlin Multiplatform, Compose Multiplatform, Gradle               |
| [packages/ao3-core](packages/ao3-core/)               | Shared AO3 DOM extraction, badges, and wire schemas | TypeScript, Zod                                                   |
| [packages/ao3-sync-client](packages/ao3-sync-client/) | Shared typed authentication and sync client         | TypeScript                                                        |

The native app's embedded browser scripts live in [apps/native-kmp/webview-scripts](apps/native-kmp/webview-scripts/) and also consume the shared packages.

## Getting started

Install [Vite+](https://viteplus.dev/guide/) (`vp`) and run the following from the repository root:

```bash
vp install --frozen-lockfile
```

Vite+ manages Node.js using the Node 24 pin in the root [package.json](package.json), along with dependency installation and workspace tasks. The pnpm workspace configuration and lockfile remain because Vite+ uses the pinned pnpm backend. Installation also prepares the extension's generated types and installs the Git hook dispatcher.

Additional prerequisites depend on what you are working on:

- **Local API development:** the 1Password desktop app and CLI, access to the configured development secrets, and the Cloudflare/PlanetScale setup described in the [API README](apps/api/README.md#development).
- **Native builds:** JDK 21, plus the Android SDK for Android or macOS and Xcode for iOS. Follow the [native build guide](apps/native-kmp/README.md).
- **Sync end-to-end tests:** Docker Desktop with Linux containers, or another Docker-compatible runtime.

Builds and tests do not require access to the API's 1Password vault.

## Development

Run these commands from the repository root. Start the API and extension in separate terminals when working on both.

```bash
# API dev server; configure 1Password local secrets first
vp run dev

# Browser extension: Chrome or Firefox
vp run --filter @qcksys/ao3tracker-browser-extension dev
vp run --filter @qcksys/ao3tracker-browser-extension dev:firefox
```

See [API local secrets](apps/api/README.md#local-secrets-in-1password) for the tracked secret reference and setup. Keep secret values in 1Password; the extension and native app do not need those secrets for local builds.

Native builds use Gradle separately from the workspace JavaScript tasks. From the repository root on macOS/Linux:

```bash
./apps/native-kmp/gradlew -p apps/native-kmp :composeApp:assembleDebug
./apps/native-kmp/gradlew -p apps/native-kmp :composeApp:run
```

On Windows PowerShell:

```powershell
.\apps\native-kmp\gradlew.bat -p apps/native-kmp :composeApp:assembleDebug
.\apps\native-kmp\gradlew.bat -p apps/native-kmp :composeApp:run
```

The first command builds the Android debug APK; the second runs the desktop app. Gradle installs workspace dependencies and builds the embedded WebView scripts as part of the native build. Use Xcode for iOS builds.

## Checks and tests

| Command                             | What it does                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `vp run ready`                      | Format, lint/type-check, test, and build the JavaScript/TypeScript workspace                 |
| `vp fmt --check`                    | Check formatting without changing files                                                      |
| `vp lint`                           | Run workspace lint and type checks                                                           |
| `vp run -r test`                    | Run each workspace package's tests without Docker                                            |
| `vp run -r build`                   | Build workspace packages; native binaries use Gradle                                         |
| `vp run test:e2e`                   | Build the API and run seeded sync tests against disposable MySQL containers; requires Docker |
| `vp node --test scripts/*.test.mjs` | Run release automation and tooling tests                                                     |
| `git hook run pre-push`             | Run workspace tests, JVM tests, and Android debug unit and instrumented tests                |

The pre-push hook requires JDK 21, the Android SDK, and a running test emulator or connected test device. Any failure, including a missing device, blocks the push. `vp run ready` does not run the native or Docker-based suites.

CI also runs the API and WebView scripts' `biome:ci` checks. See [API testing guidance](apps/api/AGENTS.md#testing) and the [seeded sync test setup](apps/api/README.md#seeded-sync-end-to-end-tests) for details.

## Contributions and releases

Branch from an updated `dev` and target pull requests at `dev`. Read the root [AGENTS.md](AGENTS.md) and the relevant app's guide before making changes: [API](apps/api/AGENTS.md), [browser extension](apps/browser-extension/AGENTS.md), or [native app](apps/native-kmp/AGENTS.md).

Add a Changeset for user-visible changes to tracked packages:

```bash
vp exec changeset
vp exec changeset status
```

Documentation-only, test-only, and internal tooling changes do not need a Changeset. Pending Changesets remain on `dev` until promoted to `main`.

GitHub Actions checks pull requests and pushes to `dev` and `main`. Release behaviour depends on the branch:

- **Pull requests:** run checks without deploying.
- **`dev`:** successful push CI deploys and smoke-tests the dev API, then releases the separate Android Dev app to internal testing and submits the Chrome Beta extension for review when their respective inputs have changed.
- **`main`:** successful push CI updates the Changesets version PR when changesets are pending. After that PR is merged, newly created and verified package-version tags trigger production API deployment, an Android internal-testing release, and a Chrome Web Store draft upload. Main pushes without new tags do not deploy.

API deployment applies pending migrations and verifies database readiness before dependent store releases can proceed. Production Chrome drafts require manual review submission; iOS and Firefox releases are manual. After merging a version PR into `main`, merge `main` back into `dev` to synchronize versions and changelogs.

See [store releases](docs/store-releases.md) for credentials, initial uploads, generated versions, patch notes, and retry behaviour.

## License

Original code and documentation in this repository are licensed under the [MIT License](LICENSE).

Third-party materials retain their own licenses. The [AO3 stylesheet fixtures](apps/native-kmp/composeApp/src/androidInstrumentedTest/assets/ao3-skins/README.md) are licensed under [GPLv2](apps/native-kmp/composeApp/src/androidInstrumentedTest/assets/ao3-skins/LICENSE.txt); their upstream license and attribution are included alongside the fixtures.
