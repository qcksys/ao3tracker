# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `apps/native-kmp/webview-scripts/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

TypeScript source for the JavaScript injected into the native KMP app's AO3 WebView. Two side-effect-only IIFE bundles are produced:

| Output | Purpose |
|---|---|
| `dist/ao3-tracking.min.js` | Extracts work metadata + scroll progress and posts JSON messages back to the host platform (AndroidBridge / WKWebKit / desktop bridge). Renders list-page badges when native pushes payloads via `window.__ao3Tracker.applyListBadges(...)`. |
| `dist/scroll-restore.min.js` | Reads the `scrollTo` query param and scrolls into `#chapters`. Clears the param. |

DOM logic lives in [`@qcksys/ao3tracker-core`](../../../packages/ao3-core) — this package is the **WebView entry layer** that wires those helpers to platform-specific `postMessage` channels.

## Commands

```bash
pnpm run build              # vp build — produces both .min.js IIFE bundles
pnpm run typecheck          # tsc --noEmit
pnpm run test               # vp test run — vitest under happy-dom
pnpm run test:watch         # vp test watch
pnpm run biome:check:unsafe # Biome with --write --unsafe
pnpm run biome:ci           # Biome CI lint
```

`pnpm run build` is invoked by the Gradle build at [apps/native-kmp/composeApp/build.gradle.kts](../composeApp/build.gradle.kts) (the `compileWebviewScripts` task). Gradle runs `pnpm install` at the **workspace root** first so the `workspace:*` link to `@qcksys/ao3tracker-core` resolves.

## Architecture

### Build pipeline

Vite refuses multi-entry IIFE bundles in library config mode (see [vitejs/vite#1736](https://github.com/vitejs/vite/discussions/1736)), so the build calls vite's programmatic `build()` API in a loop instead. The whole pipeline lives in [build.ts](./build.ts):

- One entry per iteration with its own `lib.entry`, `name`, `fileName`.
- The first iteration sets `emptyOutDir: true` to wipe `dist/`; subsequent iterations preserve siblings.
- `resolve.tsconfigPaths: true` so vite honours `~/*` → `./src/*` from [tsconfig.json](./tsconfig.json).

`pnpm run build` runs `node build.ts` end-to-end in a single command — Node 23.6+ strips TypeScript types natively, so no runner dependency is needed. [vite.config.ts](./vite.config.ts) is reserved for `vp test` / type-check only — it's not consulted during the build.

### Files

- [src/ao3-tracking.ts](./src/ao3-tracking.ts) — entry that wires `@qcksys/ao3tracker-core/dom` + `/badges` helpers to the native `postMessage` bridges. Exposes `window.__ao3Tracker.applyListBadges(payloadJson)` for native→JS evaluation.
- [src/scroll-restore.ts](./src/scroll-restore.ts) — one-shot IIFE that calls `consumeScrollToParam(document, window)` from `@qcksys/ao3tracker-core/dom`.
- [src/fixtures.ts](./src/fixtures.ts) — real AO3 HTML fixture (XCOM: The Advent Directive) used by [src/ao3-tracking.test.ts](./src/ao3-tracking.test.ts) to lock the extraction shape end-to-end.

After `pnpm run build`, the Gradle `generateWebviewScriptKotlin` task reads `dist/*.min.js` and emits Kotlin string constants under `apps/native-kmp/composeApp/build/generated/kotlin/webview/`.

## Conventions

- **Subpath imports only** from `@qcksys/ao3tracker-core`: use `/dom`, `/badges`, `/schemas`. Importing the root pulls zod into the IIFE bundle and inflates it from ~7.5 kB to ~330 kB.
- **`~/` aliases are fine here** because this package is a leaf consumer — nothing else compiles our source. Use them for cross-directory imports (e.g. tests reference `~/ao3-tracking` and `~/fixtures`). Sibling barrels can still use `./`.
- **No top-level side effects in modules that are only imported.** The two entry files own the IIFE side effects; everything else must be pure to keep tree-shaking honest.
- **Bridge contract is sacred.** The shape of messages posted via `AndroidBridge.postMessage` / `webkit.messageHandlers.ao3Handler.postMessage` is the canonical `WebViewMessage` in `@qcksys/ao3tracker-core/schemas`. Don't add fields here without updating the schema and the Kotlin parser in lockstep.
- **Bundle target is ES2018** (see `vite.config.ts`) so older Android WebView engines accept the output. Don't raise it without checking the lowest-supported Android version in the KMP build.

## Tests

[src/ao3-tracking.test.ts](./src/ao3-tracking.test.ts) drives the shared `@qcksys/ao3tracker-core/dom` helpers against real AO3 fixture HTML, and exercises the JSON-bridge wrapper for `applyListBadges`. When the AO3 work-page DOM shape changes, update the fixture and these tests together.
