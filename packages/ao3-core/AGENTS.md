# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `packages/ao3-core/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

`@qcksys/ao3tracker-core` — shared AO3 DOM extraction and wire-format zod schemas. Consumed as a `workspace:*` dependency by every client (browser extension popup/content script, native KMP webview-scripts IIFE).

## Commands

```bash
pnpm run test       # vp test run — vitest under happy-dom (DOM helper tests)
pnpm run test:watch # vp test watch
pnpm run typecheck  # tsc --noEmit
```

There is no build step: the package ships TypeScript source via `main`/`types` pointing at `./src/index.ts`. Consumers bundle it themselves.

## Architecture

### Layout

| Subpath | Contents | Has zod at runtime? |
|---|---|---|
| `@qcksys/ao3tracker-core` | Root re-export of everything | yes (via `/schemas`) |
| `@qcksys/ao3tracker-core/dom` | `getWorkInfo`, `getWorkTagInfo`, `getWorkChapterIndex`, `getWorkChapterSelect`, `findListWorkIds`, `publishScrollPercentage`, `consumeScrollToParam`, `classifyAo3Url`, `normalizeWhitespace`, `computeChapterScrollPercentage` | no |
| `@qcksys/ao3tracker-core/badges` | `formatBadge`, `applyListBadges`, `WorkBadgeData`, `WorkBadgeStatus` | no |
| `@qcksys/ao3tracker-core/schemas` | `webViewMessageSchema`, sync wire schemas, `tagTypeIds`, `tagTypeIdToName`, `favouriteTagKey`, … | yes |

Subpath exports are declared in [package.json](./package.json). **Prefer them over the root export** for size-sensitive bundles (the native KMP IIFE is 7.75 kB today; rooting the import would balloon it to ~330 kB by pulling zod in).

### Build / tooling
- [vite.config.ts](./vite.config.ts) — `resolve.tsconfigPaths: true` so vite (and vitest under `vp test`) honour the `~/*` → `./src/*` mapping from [tsconfig.json](./tsconfig.json).
- [tsconfig.json](./tsconfig.json) — strict mode, `verbatimModuleSyntax`, ESNext + Bundler resolution.

## Conventions

- **Pure functions, no I/O.** Every DOM helper takes `(doc: Document, location: Location)` explicitly so the same code runs in real browsers, content-script-injected pages, and happy-dom unit tests. No `window`/`document` globals at module scope.
- **No `~/` aliases in this package's own source.** This package ships as TypeScript source; consumers' tsconfig path mappings are different, so `~/badges` from inside `src/` would not resolve when a consumer compiles its dependency tree. Use relative imports (`./foo`, `../foo`) for internal cross-directory references. `~/` is reserved for leaf consumers (apps).
- **Sibling barrel re-exports stay `./foo`** — `src/index.ts`, `src/dom/index.ts`, `src/schemas/index.ts`.
- **API contract changes propagate.** When [apps/api/src/routes/api.track.ts](../../apps/api/src/routes/api.track.ts) changes shape, update [src/schemas/sync.ts](./src/schemas/sync.ts) in the same PR so the wire schemas stay in lockstep.
- **Badge status set is cross-platform.** Any new `WorkBadgeStatus` needs matching cases in `formatBadge` here AND in the native Kotlin `WorkBadgePayload` / `Ao3Repository.buildBadgePayload`. See [apps/native-kmp/AGENTS.md](../../apps/native-kmp/AGENTS.md) → "List-page badges".

## Tests

Pure DOM + utility tests under happy-dom ([src/dom/extract.test.ts](./src/dom/extract.test.ts), [src/dom/utils.test.ts](./src/dom/utils.test.ts)). When adding a new DOM extraction helper, add a fixture-driven test alongside it.
