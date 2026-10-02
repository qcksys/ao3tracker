# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `apps/native-kmp/webview-scripts/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

TypeScript source for the JavaScript injected into the native KMP app's AO3 WebView. Three side-effect-only IIFE bundles are produced:

| Output                       | Purpose                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dist/ao3-tracking.min.js`   | Extracts work metadata + scroll progress and posts JSON messages back to the host platform (AndroidBridge / WKWebKit / desktop bridge). Renders list-page badges when native pushes payloads via `window.__ao3Tracker.applyListBadges(...)`. |
| `dist/scroll-restore.min.js` | Reads the `scrollTo` query param and scrolls into `#chapters`. Clears the param.                                                                                                                                                             |

`dist/search-check.min.js` runs independently in a separate WebView. It reads every saved-search result page with the device's hidden tags, hidden works, enabled language preference and maximum fandom count, then posts `SearchCheckMessage` progress/results/errors. It must not inject reading-tracker scripts or trigger sync/notifications; native stores snapshots and computes counts locally. The first success or a changed search context establishes a baseline.

DOM logic lives in [`@qcksys/ao3tracker-core`](../../../packages/ao3-core) — this package is the **WebView entry layer** that wires those helpers to platform-specific `postMessage` channels.

## Commands

```bash
vp run build              # produces all .min.js IIFE bundles
vp run typecheck          # tsc --noEmit
vp run test               # vp test run — vitest under happy-dom
vp run test:watch         # vp test watch
vp run biome:check:unsafe # Biome with --write --unsafe
vp run biome:ci           # Biome CI lint
```

`vp run build` is invoked by the Gradle build at [apps/native-kmp/composeApp/build.gradle.kts](../composeApp/build.gradle.kts) (the `compileWebviewScripts` task). Gradle runs `vp install` at the **workspace root** first so the `workspace:*` link to `@qcksys/ao3tracker-core` resolves.

## Architecture

### Build pipeline

Vite refuses multi-entry IIFE bundles in library config mode (see [vitejs/vite#1736](https://github.com/vitejs/vite/discussions/1736)), so the build calls vite's programmatic `build()` API in a loop instead. The whole pipeline lives in [build.ts](./build.ts):

- One entry per iteration with its own `lib.entry`, `name`, `fileName`.
- The first iteration sets `emptyOutDir: true` to wipe `dist/`; subsequent iterations preserve siblings.
- `resolve.tsconfigPaths: true` so vite honours `~/*` → `./src/*` from [tsconfig.json](./tsconfig.json).

`vp run build` runs `node build.ts` end-to-end in a single command — the required Node 24 runtime strips TypeScript types natively, so no runner dependency is needed. [vite.config.ts](./vite.config.ts) is reserved for `vp test` / type-check only — it's not consulted during the build.

### Files

- [src/ao3-tracking.ts](./src/ao3-tracking.ts) wires shared DOM and badge helpers to the native bridges. Exposes `applyListBadges`, `reportReadingActivity`, and `applyBrowsingState` on `window.__ao3Tracker`. The `browsingReady` handshake runs on every page, including empty results. Native replies with `{ hiddenWorkIds, hiddenTags, savedSearchUrls, languageFilterEnabled, searchLanguage, maxFandoms }`; the script merges default tag exclusions and enforces enabled language filtering in work/bookmark URLs and GET forms, updates the saved label, and adds Hide work/Unhide actions. Those actions post `{ type: "setWorkHidden", url, workId, hidden }`. Keep the fields aligned with shared browsing schemas and native `BrowsingState`/`SetWorkHiddenEvent`.
- [src/scroll-restore.ts](./src/scroll-restore.ts) — one-shot IIFE that calls `consumeScrollToParam(document, window)` from `@qcksys/ao3tracker-core/dom`.
- [test/ao3-tracking.test.ts](./test/ao3-tracking.test.ts) — drives the shared `@qcksys/ao3tracker-core/dom` helpers against real AO3 fixture HTML; exercises the JSON-bridge wrapper for `applyListBadges`.
- [test/fixtures.ts](./test/fixtures.ts) — real AO3 HTML fixture (XCOM: The Advent Directive) used by the test above.

After `vp run build`, the Gradle `generateWebviewScriptKotlin` task reads `dist/*.min.js` and emits Kotlin string constants under `apps/native-kmp/composeApp/build/generated/kotlin/webview/`.

## Conventions

- **Formatting** uses workspace-root Oxfmt (`vp fmt`) with two-space indentation. Biome runs lint and import organization only, with its formatter disabled.
- **Subpath imports only** from `@qcksys/ao3tracker-core`: use `/dom`, `/badges`, `/schemas`. Importing the root pulls zod into the IIFE bundle and inflates it from ~7.5 kB to ~330 kB.
- **`~/` aliases are fine here** because this package is a leaf consumer — nothing else compiles our source. Use them for cross-directory imports (e.g. tests reference `~/ao3-tracking` and `~/fixtures`). Sibling barrels can still use `./`.
- **No top-level side effects in modules that are only imported.** The entry files own the IIFE side effects; everything else must be pure to keep tree-shaking honest.
- **Bridge contract is sacred.** The shape of messages posted via `AndroidBridge.postMessage` / `webkit.messageHandlers.ao3Handler.postMessage` is the canonical `WebViewMessage` in `@qcksys/ao3tracker-core/schemas`. Don't add fields here without updating the schema and the Kotlin parser in lockstep.
- **Bundle target is ES2018** (see `vite.config.ts`) so older Android WebView engines accept the output. Don't raise it without checking the lowest-supported Android version in the KMP build.

## Tests

[test/ao3-tracking.test.ts](./test/ao3-tracking.test.ts) drives the shared `@qcksys/ao3tracker-core/dom` helpers against real AO3 fixture HTML, and exercises the JSON-bridge wrapper for `applyListBadges`. When the AO3 work-page DOM shape changes, update the fixture and these tests together.

Crossover preferences: `maxFandoms` is a positive integer or `null` (no limit, including existing installs). A value of 1 injects `work_search[crossover]=F` into work-search URLs and GET forms; AO3 bookmark searches do not support that parameter. `applyFandomLimit` hides work/bookmark blurbs whose `.fandoms a.tag` count exceeds the limit, independently of manually hidden works, and restores them when relaxed or cleared. Saved-search matching includes the effective crossover filter. Native saved-search checks use the same limit on every page and include it in their baseline context. Native serialization omits a cleared `maxFandoms`; shared helpers treat either an absent or null value as unlimited.
