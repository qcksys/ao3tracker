# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `packages/ao3-core/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

`@qcksys/ao3tracker-core` — shared AO3 DOM extraction and wire-format zod schemas. Consumed as a `workspace:*` dependency by every client (browser extension popup/content script, native KMP webview-scripts IIFE).

## Commands

```bash
vp run test       # vp test run — vitest under happy-dom (DOM helper tests)
vp run test:watch # vp test watch
vp run typecheck  # tsc --noEmit
```

There is no build step: the package ships TypeScript source via `main`/`types` pointing at `./src/index.ts`. Consumers bundle it themselves.

## Architecture

### Layout

| Subpath                           | Contents                                                                                                                                                                                                                        | Has zod at runtime?  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@qcksys/ao3tracker-core`         | Root re-export of everything                                                                                                                                                                                                    | yes (via `/schemas`) |
| `@qcksys/ao3tracker-core/dom`     | `getWorkInfo`, `getWorkTagInfo`, `getWorkChapterIndex`, `getWorkChapterSelect`, `findListWorkIds`, `publishScrollPercentage`, `consumeScrollToParam`, `classifyAo3Url`, `normalizeWhitespace`, `computeChapterScrollPercentage` | no                   |
| `@qcksys/ao3tracker-core/badges`  | `formatBadge`, `applyListBadges`, `WorkBadgeData`, `WorkBadgeStatus`                                                                                                                                                            | no                   |
| `@qcksys/ao3tracker-core/schemas` | `webViewMessageSchema`, sync wire schemas, `tagTypeIds`, `tagTypeIdToName`, `favouriteTagKey`, …                                                                                                                                | yes                  |

Subpath exports are declared in [package.json](./package.json). **Prefer them over the root export** for size-sensitive bundles (the native KMP IIFE is 7.75 kB today; rooting the import would balloon it to ~330 kB by pulling zod in).

### Build / tooling

- [vite.config.ts](./vite.config.ts) — `resolve.tsconfigPaths: true` so vite (and vitest under `vp test`) honour the `~/*` → `./src/*` mapping from [tsconfig.json](./tsconfig.json).
- [tsconfig.json](./tsconfig.json) — strict mode, `verbatimModuleSyntax`, ESNext + Bundler resolution.

## Conventions

- **DOM helpers receive their environment explicitly.** Pass the document and URL/location to helpers so they work in browsers, native WebViews, and happy-dom. `/dom/browsing` owns URL matching, default tag exclusions, and reversible blurb hiding. Match live saved URLs after applying defaults; ignore pagination, fragments, empty fields and form submit metadata. Merge tags into `work_search[excluded_tag_names]` or `bookmark_search[excluded_tag_names]`, as defined by AO3's [work](https://github.com/otwcode/otwarchive/blob/master/app/models/search/work_search_form.rb) and [bookmark](https://github.com/otwcode/otwarchive/blob/master/app/models/search/bookmark_search_form.rb) models. Keep persistence and navigation in the client entrypoints. Use type-only schema imports in DOM code to avoid bundling Zod.
- **Notification preferences**: `/notifications` exports the canonical Zod device-preference schema and delivery predicate without DOM types. The API and extension share this schema; match its JSON fields in native `NotificationPreferences`. All categories default on. Master disable preserves category choices.
- **No `~/` aliases inside `src/`.** This package ships as TypeScript source; consumers' tsconfig path mappings are different, so `~/badges` from inside `src/` would not resolve when a consumer compiles its dependency tree. Use relative imports (`./foo`, `../foo`) for internal cross-directory references within `src/`. Tests in `test/` are private to this package and may freely use `~/`.
- **Sibling barrel re-exports stay `./foo`** — `src/index.ts`, `src/dom/index.ts`, `src/schemas/index.ts`.
- **API contract changes propagate.** When [apps/api/src/routes/api.track.ts](../../apps/api/src/routes/api.track.ts) changes shape, update [src/schemas/sync.ts](./src/schemas/sync.ts) in the same PR so the wire schemas stay in lockstep.
- **Scroll chapter identity.** `scrollProgress.chapterId` is an optional nullable string. `publishScrollPercentage` uses the same DOM chapter extractor as `getWorkInfo`; extension and native receivers prefer it over the URL and retain URL fallback for older messages.
- **Chapter tombstones.** POST `/api/track/sync` chapters accept optional `deleted` (default `false`), resolved using the chapter's `lastReadAt`. GET chapters always include `deleted`; full GETs include tombstones for reconciliation.
- **Badge status set is cross-platform.** Any new `WorkBadgeStatus` needs matching cases in `formatBadge` here AND in the native Kotlin `WorkBadgePayload` / `Ao3Repository.buildBadgePayload`. See [apps/native-kmp/AGENTS.md](../../apps/native-kmp/AGENTS.md) → "List-page badges".

## Tests

Pure DOM + utility tests under happy-dom live in [test/](./test/) — flat layout mirroring `src/dom/`:

- [test/extract.test.ts](./test/extract.test.ts) covers `findListWorkIds`, `getWorkInfo`.
- [test/utils.test.ts](./test/utils.test.ts) covers `normalizeWhitespace`, `classifyAo3Url`.

Tests use the `~/*` alias to reach into `src/` (e.g. `import ... from "~/dom/extract"`). The `~/` alias is fine in test files because tests are never bundled by downstream consumers — they're a private concern of this package.

When adding a new DOM extraction helper, add a fixture-driven test in `test/`.
