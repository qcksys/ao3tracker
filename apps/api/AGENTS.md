# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `apps/api/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

AO3 Tracker API - A Cloudflare Worker-based REST API for tracking Archive of Our Own (AO3) fanfiction works. Built with
Hono framework, Drizzle ORM, and Better Auth for authentication.

## Commands

```bash
# Development
pnpm dev                    # Start local dev server with wrangler
pnpm types:cf               # Generate Cloudflare bindings types (CloudflareBindings interface)
pnpm types:tsc              # Run TypeScript type check (tsc --noEmit)
pnpm proxy                  # Start cloudflared tunnel for local dev

# Testing
pnpm test                   # Run all Vitest tests
pnpm test -- test/ao3-parser.test.ts           # Run specific test file
pnpm test -- -t "should parse work title"      # Run tests matching pattern

# Deployment
pnpm deploy:dev             # Deploy to dev environment
pnpm deploy:prod            # Deploy to production

# Database
pnpm db:generate            # Generate Drizzle migrations
pnpm db:migrate             # Run Drizzle migrations
pnpm db:push                # Push schema changes directly

# Linting
pnpm biome:check:unsafe     # Fix linting issues with unsafe fixes
pnpm biome:ci               # CI linting check (used in GitHub Actions)
```

## Architecture

### Runtime & Deployment

- Cloudflare Workers with Node.js compatibility mode
- PlanetScale MySQL database via `@planetscale/database`
- Environments: `local`, `dev`, `prod` (configured in `wrangler.json`)
- Production deployments use the root reusable [API workflow](../../.github/workflows/deploy-api.yml), called with the exact commit SHA that passed CI. Development deployments remain manual.

### Production deployment readiness

The `api-production` GitHub environment needs `CLOUDFLARE_API_TOKEN` and a read-only `DATABASE_URL` pointing to the same production database used by the Worker. The Cloudflare account ID is already in `wrangler.json`. Scope the token to the configured account and production zone with Worker deployment and required binding/route permissions. Provision the production R2 bucket, notification/dead-letter queues, email sender, and Worker runtime secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_ID`, `GOOGLE_SECRET`, `FCM_SERVICE_ACCOUNT`) separately. Wrangler preserves existing Worker secrets; the GitHub database credential is only used for readiness checks and is not uploaded.

The workflow rejects a source SHA that is no longer current `main`, including reruns of failed deployment jobs. After deployment it checks the public `/ping` response. This smoke test checks routing and Worker startup; it does not identify the deployed revision or test authenticated database operations.

Before building/deploying, `node scripts/check-api-migrations.mjs` from the repository root reads `ao3track__migrations` and database column metadata. Every checked-in journal migration must have the same timestamp and SQL SHA-256 in the ledger; missing, edited, duplicate, or unknown entries stop deployment. Both LF and CRLF versions of the checked-in SQL are accepted because Drizzle hashes raw bytes and historical migrations may have run on Windows. No other content differences are accepted. The gate also verifies that the latest snapshot's columns exist and that temporal column types retain the required precision. It does not validate all indexes, defaults, or existing data.

Apply reviewed schema changes separately through PlanetScale's schema-change process, including migrations `0011` and `0012` before deploying this code. Historical SQL is not an automatic bootstrap script: DDL is not transactionally rolled back, and an existing database may have been changed outside Drizzle. If the ledger is absent or differs, inspect the live schema and reconcile its history only after confirming which changes are already applied. The deployment gate never runs migration SQL, writes ledger rows, or skips a mismatch. Keep each SQL migration registered in the journal with its matching snapshot.

### Framework Stack

- **Hono** - Web framework with OpenAPI support via `@hono/zod-openapi`
- **Drizzle ORM** - Database ORM with Zod schema generation (`drizzle-zod` for schema generation)
- **Better Auth** - Authentication with email/password, Google OAuth, passkeys, and 2FA
- **Zod** - Schema validation
- **Scalar** - OpenAPI documentation UI (`@scalar/hono-api-reference`)
- **Vitest** - Testing framework with `@cloudflare/vitest-plugin`, using the aligned Vite+ runtime

### Code Structure

**Entry Point**: `src/index.ts` - Main router with middleware chain:

1. `timing()` - Request timing
2. `cors()` - CORS handling
3. `startupMw` - Initializes DB connection and auth instance per request
4. `authMw` - Session validation (sets user/session or null)
5. Routes: `/`, `/ping`, `/openapi`, `/auth/*`, `/api/*` (protected)

**API Routes** (`src/routes/`):

- `api.ts` - Main API router, applies `requireAuthMw` for all `/api/*` routes
- `api.parse.ts` - AO3 HTML parsing endpoints (`/api/parse/{workId}`, `/api/parse/{workId}/chapters`)
- `api.track.ts` - Bidirectional sync endpoint (`/api/track/sync`)
- `api.backup.ts` - Backup creation and listing (`/api/backup`, `/api/backup/{workId}`)

**Middleware Pattern** (`src/middleware/`):

- `startupMw.ts` - Creates DB and auth instances, sets `c.var.db`, `c.var.env`, `c.var.auth`
- `authMw.ts` - Session validation, sets `c.var.user` and `c.var.session` (nullable)
- `requireAuthMw.ts` - Enforces authentication, returns 401 if no session

**AO3 Parser** (`src/lib/ao3-parser.ts`):

- Uses Cloudflare's `HTMLRewriter` for streaming HTML parsing
- `parseWorkPage()` - Extracts work metadata and tags from work pages
- `parseChapterIndex()` - Extracts chapter list from navigate pages
- `fetchAndParseWork()` / `fetchAndParseChapterIndex()` - Fetch and parse helpers

**Scheduled Tasks** (`src/scheduled/`):

- `handler.ts` - Cron dispatcher, runs every 5 minutes (`*/5 * * * *`)
- `refresh-works.ts` - Refreshes stale work data (not refreshed in 6 hours, up to 12 works/run in batches of 4), downloads
  and backs up each format to R2 if `downloadUpdatedAt` is newer than that format's latest active backup's `ao3UpdatedAt`. Failed formats retry on the next refresh even when another format already succeeded. Creates notifications
  for new chapters, work completion, deletion, and restriction.
- `fetch-missing-works.ts` - Fetches data for tracked works missing from the works table (up to 12 works/run)
- `work-fetcher.ts` - Shared utilities for fetching and parsing AO3 work pages

**Notification System** (`src/lib/notification-service.ts`, `src/db/queries/notification.ts`):

- Creates notification records when works are updated (new chapters, completion, deletion, restriction)
- Queues notifications for delivery via Cloudflare Queue (`NOTIFICATION_QUEUE`)
- User batches fan out into one queued delivery per `(userId, deviceId)`. Failed device deliveries retry with the queue's retry budget and dead-letter queue; successful devices are acknowledged independently. An FCM `UNREGISTERED` response invalidates the token and is acknowledged. Queue delivery remains at least once.
- Only notifies users who have `subscribed = true` for the work (default is `true`)
- Notification types: `new_chapters`, `work_completed`, `work_restricted`, `work_deleted`

**Work Backup System**:

- Backups stored in Cloudflare R2 bucket (`WORK_BACKUPS_BUCKET`)
- Downloads epub and html formats when works are refreshed with newer `downloadUpdatedAt`
- R2 key format: `{workId}/{downloadUpdatedAt_timestamp}.{format}`
- Backup metadata tracked in `work.backup.ts` schema

**Database Schema** (`src/db/schema/`):

- All tables prefixed with `ao3track__` (defined in `src/const.ts`)
- Auth tables: `auth.user.ts`, `auth.session.ts`, `auth.account.ts`, `auth.passkey.ts`, `auth.twoFactor.ts`,
  `auth.verification.ts`
- Work tables: `work.ts`, `work.chapter.ts`, `work.tag.ts`, `work.tag.link.ts`, `work.backup.ts`
- Tracking tables: `track.work.ts`, `track.chapter.ts`
- Schema naming convention: `tTableName` for tables, `rTableName` for relations, `sTableNameS/I/U` for
  select/insert/update Zod schemas
- Export primary key columns for composite keys: `export const tTableNamePK = [table.col1, table.col2] as const;`
- Use `timestampCols` from `src/db/helpers/schema.ts` for row audit columns
- **NEVER manually create DB types** - always extend from Drizzle types exported from schema files:
  ```typescript
  // Good - use Drizzle-generated types from schema
  import { type TWorkS, type TWorkI } from "~/db/schema/work";
  import { type TDatabase } from "~/db/db.client";

  // Bad - manually defining types that mirror DB columns
  interface Work { id: number; title: string; ... }
  ```

**Database Queries** (`src/db/queries/`):

- All database operations MUST be placed in this folder, not in routes or scheduled tasks
- One file per domain: `work.ts`, `backup.ts`, `track.ts`, etc.
- Functions receive `TDatabase` as first parameter
- Keep queries simple and composable - business logic belongs in routes/scheduled tasks
- Use Drizzle query methods (`eq`, `and`, `lt`, etc.) instead of raw `sql` template literals
- **ALL inserts MUST be upserts** - Never use plain `insert()`, always use `onDuplicateKeyUpdate()` for idempotency.
  Exception: tables with auto-increment primary keys where you always want new records (e.g., `tNotification`).
- **Upserts MUST exclude timestamp columns** - Always exclude `rowCreatedAt` and `rowUpdatedAt` from upsert SET clauses
  to preserve creation time and let MySQL's `ON UPDATE CURRENT_TIMESTAMP` handle update time:
  ```typescript
  import { onDuplicateKeyUpdateConfig } from "@qcksys/drizzle-extensions";

  // In schema: export timestamp exclusion array
  export const tWorkTimestampExclude = [tWork.rowCreatedAt, tWork.rowUpdatedAt] as const;

  // Simple table - exclude timestamp columns
  await db
    .insert(tWork)
    .values(data)
    .onDuplicateKeyUpdate(onDuplicateKeyUpdateConfig(tWork, { exclude: tWorkTimestampExclude }));

  // Composite primary key - exclude both PK and timestamp columns
  // In schema: export const tTrackWorkPK = [tTrackWork.userId, tTrackWork.workId] as const;
  await db
    .insert(tTrackWork)
    .values(values)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tTrackWork, {
        exclude: [...tTrackWorkPK, ...tTrackWorkTimestampExclude],
      }),
    );

  // Table with unique constraint (not PK) - exclude auto-increment ID AND unique key
  // Example: tWorkTag has auto-increment `id` PK but unique constraint on `tag`
  // In schema: export const tWorkTagUpsertExclude = [tWorkTag.id, tWorkTag.tag] as const;
  await db
    .insert(tWorkTag)
    .values(tags)
    .onDuplicateKeyUpdate(
      onDuplicateKeyUpdateConfig(tWorkTag, {
        exclude: tWorkTagUpsertExclude,
      }),
    );
  ```
- Name insert functions with `upsert` prefix (e.g., `upsertWork`, `upsertBackup`) to clarify behavior
- **Query types MUST derive from schema types** - Use `Pick`, `Omit`, or `Required` with schema types (`TTableS`, `TTableI`):
  ```typescript
  // Good - derive from schema types
  export type WorkUpdateData = Pick<TWorkI, "title" | "author" | ...>;
  export type BackupRecord = Pick<TWorkBackupS, "workId" | "format" | ...>;
  export type ChapterData = Required<Pick<TWorkChapterI, "id" | "workId" | ...>>;

  // Bad - manually defining types that mirror schema
  export interface WorkUpdateData { title: string; author: string; ... }
  ```

**Type Definitions**:

- `TRouterEnvFw` - Base router environment with db, env, auth
- `TRouterEnvAuth` - Extended with user and session (nullable)
- `TRouterEnvAuthReq` - Extended with non-null user and session (for protected routes)
- `AppEnv` / `AppContext` - Hono app type aliases
- Path alias: `~/*` maps to `./src/*`

**OpenAPI & Documentation**:

- `/openapi` - Scalar UI with both app and auth OpenAPI specs
- `/app.openapi.json` - App routes OpenAPI spec
- `/auth.openapi.json` - Better Auth OpenAPI spec
- `/llms.txt` and `/llms-auth.txt` - Markdown versions for LLM consumption

### Configuration Files

- `wrangler.json` - Cloudflare Workers config with env-specific settings
- `.dev.vars` - Local environment secrets (not committed)
- `drizzle.config.ts` - Drizzle Kit config (reads from env vars via `src/env.ts`)
- `better-auth.config.ts` - Better Auth configuration
- `vitest.config.ts` - Vitest configuration with Cloudflare Workers pool

### Testing

- Test files in `test/` directory
- Uses `@cloudflare/vitest-plugin` for Workers-compatible testing with local Miniflare options; tests do not load deployment bindings or secrets
- Keep Vite+ and its Vite core aligned at `0.3.3` with Vitest `4.1.11`; the Workers test plugin supports Vitest 4. The workspace catalog owns these compatibility pins.
- Fixtures in `test/*.fixtures.ts`
- Coverage includes AO3 parsing, sync conflict/cursor regressions, notification retries, partial backups, and auth origins

### Authentication dependency upgrades

Better Auth and its passkey plugin use the same catalog version. Better Auth 1.7 requires `verified`, `failedVerificationCount`, and `lockedUntil` on the two-factor table. Apply migration `0012_auth-two-factor-lockout.sql` before deploying this upgrade; its verified default preserves existing enrollments. Auth-origin tests instantiate the real adapter and check that its declared schema remains compatible.

### Extension authentication origins

Auth rate limiting uses database storage in every environment. Client IP detection trusts only Cloudflare's `CF-Connecting-IP` header; do not add caller-controlled forwarded headers. Origin tests use Better Auth's real memory limiter within each test fixture, while asserting the production configuration remains database-backed and enabled.

`ALLOWED_ORIGINS` supplies both CORS and Better Auth origin validation. The Chrome Web Store listing and manifest public key use ID `hjonebiohecalkggemeneaaohafldkkl`, explicitly allowed in local/dev/prod. The previous unpacked development ID `blgkokkfdhkkgaghemkodncmjfjbpjdc` remains allowed for existing development installs. Deploy the matching API origin configuration before releasing the extension. The WXT Firefox development profile pins runtime UUID `9f7fd2ce-5e43-4d3e-9d4e-92f89126df55`, allowed only in local/dev. Firefox's add-on ID (`ao3tracker@qcksys.com`) does not identify its per-install HTTP origin. Signed Firefox distribution needs a hosted authentication flow or another explicit origin strategy before release; do not add a blanket extension wildcard.

### Code Style

- Formatting uses workspace-root Oxfmt (`pnpm exec vp fmt`) with two-space indentation and double quotes. Biome formatting is disabled to avoid conflicting output.
- Imports organized automatically via Biome
- Husky pre-commit hook runs `pnpm biome:ci`
- Prefer `eq()`, `and()`, `lt()` etc. from `drizzle-orm` over raw `sql` templates
- **Always use upserts** - Every `insert()` must have `.onDuplicateKeyUpdate()` for idempotency and retry safety
- **No backwards-compatibility re-exports** - When renaming or moving exports, update all references directly instead of
  adding re-exports for backwards compatibility
- Console logs must use structured objects with a `message` key:
  ```typescript
  // Good
  console.log({ message: "Processing work", workId: 123 });
  console.error({ message: "Failed to fetch", workId: 123, error });

  // Bad
  console.log("Processing work 123");
  console.log(`Processing work ${workId}`);
  ```

### Sync API Pattern

The `/api/track/sync` endpoint uses cursor-based pagination for bidirectional sync:

- **GET /sync** - Fetch server data with optional `lastSyncedAt` timestamp for incremental sync
- **POST /sync** - Send client changes: `works[]` and `chapters[]` arrays
- Pagination on works only (default 50, max 50); all chapters for returned works included
- Returns `nextWorkCursor` for pagination. `serverLastUpdated` is a database watermark captured **before** page reads and intentionally lags the database clock by 16 minutes; clients keep the **first page's** value and advance their pull cursor only after every page succeeds. Neither this cursor nor `latestWorkLastReadAt` filters pending uploads.
- The replay window covers [PlanetScale's 900-second autocommit query timeout](https://planetscale.com/docs/vitess/scaling/planetscale-system-limits) plus 60 seconds. MySQL mutation timestamps record statement start, so writes waiting to commit must be replayed. This assumes UTC database clocks and primary reads. Increase the window if custom query/transaction limits allow longer writes. The tradeoff is repeated recent rows, with no delay in delivering new data.
- Incremental reads use server-managed `rowUpdatedAt >= lastSyncedAt`, including the boundary to replay concurrent writes in the same millisecond. Work eligibility includes chapter-tracking and shared work/chapter metadata changes; tag replacement advances its parent work's marker. Client event timestamps remain solely conflict-resolution clocks.
- Sync timestamps use `datetime(3)`. Migration `0011_sync-mutation-cursors.sql` upgrades precision. Client storage migrations reset the old event-time cursor once. Full sync includes all tombstones so an existing client can safely reconcile after resetting its cursor.

**Per-Field Last-Write-Wins (LWW) Conflict Resolution**:

The sync uses LWW independently for each field group:

| Field Group                                 | Compared Using        | Notes                                           |
| ------------------------------------------- | --------------------- | ----------------------------------------------- |
| `lastReadAt`, `markedCompleteAt`, `private` | `lastReadAt`          | Reading progress fields                         |
| `subscribed`                                | `subscribedUpdatedAt` | Explicit timestamp (falls back to `lastReadAt`) |
| `favourite`                                 | `favouriteUpdatedAt`  | Explicit timestamp (falls back to `lastReadAt`) |

This enables multi-device sync where toggling `favourite` on Device A won't be overwritten when Device B syncs reading
progress. Server wins on timestamp tie. See `src/db/helpers/lww.ts` for the `resolveLWW()` helper.

Chapter uploads accept optional `deleted` (default `false`). A chapter tombstone or restore uses `lastReadAt` as its mutation clock, and only a strictly newer mutation replaces persisted state. Accepted chapter deletions retain the existing `accepted` response status.

All sync upserts enforce LWW in SQL at write time. Tombstones participate in work comparisons, including deletes arriving before their original insert. A newer reading event can restore a deleted work; older uploads cannot. MySQL evaluates assignments in order, and Drizzle uses schema column order: keep conflict-clock columns after fields that compare them. Post-write acknowledgements describe persisted field groups; an exact idempotent retry may return `accepted`.

**Favourite Tag Filters** (per-row sync, separate from per-work `favourite`):

The `tUserFavouriteTag` table stores which filter chips a user has pinned in their Track tab. Schema:
`(userId, tagType, tag) → (favourited, updatedAt)`. `tagType` is the integer id from the `tagTypes` enum (0=unknown … 7=freeform).

- **Tombstones in place**: unfavouriting sets `favourited = false` rather than deleting. The live set is `WHERE favourited = true`; the sync delta uses server `rowUpdatedAt >= lastSyncedAt`, carrying late offline adds and removes.
- **LWW per row**: each (tagType, tag) row LWW-merges independently on `updatedAt`. Server wins on tie. Logic lives in `resolveFavouriteTagMerge` (pure helper, unit-tested in `test/user-favourite-tag.test.ts`).
- **Wire shape**: GET response gains `favouriteTags: Array<{tagType, tag, favourited, updatedAt}>`, returned only on the first page of a paginated sync run (when `workCursor` is not set). POST body accepts the same array (max 500) and the response echoes per-row `accepted`/`ignored` status.
- **Snapshot vs delta**: GET with no `lastSyncedAt` returns all rows, including tombstones. GET with `lastSyncedAt` returns rows with a server mutation timestamp at or after the cursor, including tombstones.
- Implementation: `src/db/schema/user.favouriteTag.ts`, `src/db/queries/user-favourite-tag.ts`.

**Saved Searches** (per-row sync, named AO3 filter URLs):

The `tUserSavedSearch` table stores searches a user pinned from an AO3 list page. Schema:
`(userId, id) → (name, url, deleted, updatedAt)`, where `id` is a **client-generated uuid** (the stable row identity, so `name`/`url` can be edited without changing the key — unlike favourite tags, which key on the natural `(tagType, tag)` pair).

- **Tombstones in place**: deleting sets `deleted = true` rather than removing the row. The live set is `WHERE deleted = false`; the sync delta uses server `rowUpdatedAt >= lastSyncedAt`, carrying late offline saves and deletes.
- **LWW per row**: each row LWW-merges independently on `updatedAt`, keyed by `id`. Server wins on tie. Logic lives in `resolveSavedSearchMerge` (pure helper, unit-tested in `test/user-saved-search.test.ts`).
- **Wire shape**: GET response gains `savedSearches: Array<{id, name, url, deleted, updatedAt}>`, returned only on the first page (same `workCursor`-not-set gating as favourite tags). POST body accepts the same array (max 500) and the response echoes per-row `accepted`/`ignored` status.
- **Snapshot vs delta**: GET with no `lastSyncedAt` returns all rows, including tombstones. GET with `lastSyncedAt` returns rows with a server mutation timestamp at or after the cursor, including tombstones.
- **Additive contract**: all `savedSearches` fields are optional, so existing clients (incl. the native app, which ignores unknown keys) keep working unchanged. Implementation: `src/db/schema/user.savedSearch.ts`, `src/db/queries/user-saved-search.ts`, migration `0010_shiny_black_cat.sql`.
