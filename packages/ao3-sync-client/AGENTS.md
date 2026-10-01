# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `packages/ao3-sync-client/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

`@qcksys/ao3tracker-sync-client` — typed `fetch` wrapper around the AO3 Tracker API's `/api/track/sync` endpoint and Better Auth flows. Validates every response with the zod schemas from [`@qcksys/ao3tracker-core/schemas`](../ao3-core). Also exports the pure LWW merge for favourite-tag rows.

Consumed by [`apps/browser-extension`](../../apps/browser-extension). Future native ports import the same surface.

## Commands

```bash
vp run test       # vp test run — vitest under Node
vp run typecheck  # tsc --noEmit
```

No build step: ships as TypeScript source via `main`/`types` pointing at `./src/index.ts`.

## Architecture

### Exports

| Symbol                                                | Purpose                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `getSync`, `postSync`, `getFullSync`                  | `/api/track/sync` request helpers (response-validated with zod)                         |
| `signInEmail`, `signUpEmail`, `signOut`, `getSession` | Better Auth email/password flows at `/auth/...`                                         |
| `mergeFavouriteTags`, `liveFavouriteTagSet`           | Pure per-row LWW merge for favourite-tag rows                                           |
| `SyncApiError`                                        | Thrown on non-2xx responses or schema-failed responses; carries `status`, `url`, `body` |
| `SyncClientConfig`                                    | `{ baseUrl, getBearerToken?, fetchImpl?, includeCredentials? }`                         |

### Build / tooling

- [vite.config.ts](./vite.config.ts) — `resolve.tsconfigPaths: true` honours `~/*` → `./src/*` from [tsconfig.json](./tsconfig.json) when running `vp test`.
- [tsconfig.json](./tsconfig.json) — strict, `verbatimModuleSyntax`, Bundler resolution. Lib excludes DOM.Iterable (Node-targeted).

## Conventions

- **All responses validated.** Every endpoint helper passes a zod schema to `request(...)`. If the server returns a shape the client doesn't expect, it throws `SyncApiError` (with the zod issue list) instead of silently corrupting state. Don't bypass this.
- **No `~/` aliases inside `src/`.** Same reason as ao3-core: consumers compile our TS source under their tsconfig, so internal cross-directory imports must be relative. Tests in `test/` may freely use `~/` (they're never bundled by consumers).
- **LWW mirrors the server.** The merge in [src/lww.ts](./src/lww.ts) must agree with `resolveFavouriteTagMerge` at [apps/api/src/db/queries/user-favourite-tag.ts](../../apps/api/src/db/queries/user-favourite-tag.ts). Server wins on tie (locally that maps to "remote wins on tie"). Tests in [test/lww.test.ts](./test/lww.test.ts) lock the behaviour.
- **No retry / backoff here.** Callers handle retries (the browser extension debounces sync and re-runs on the next page event or alarm). Keep this package a thin, deterministic layer.
- **Pagination watermark.** `getFullSync` preserves the first page's `serverLastUpdated` for the next incremental GET. Later pages may observe newer mutations; advancing to their watermark could skip changes to works on earlier pages. This is a server mutation cursor, independent of client LWW timestamps.
