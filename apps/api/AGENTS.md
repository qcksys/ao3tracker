# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in `apps/api/`. `CLAUDE.md` next to this file is a symlink to it.

## Project Overview

AO3 Tracker API - A Cloudflare Worker-based REST API for tracking Archive of Our Own (AO3) fanfiction works. Built with
Hono framework, Drizzle ORM, and Better Auth for authentication.

## Commands

```bash
# Development
vp run dev                    # Start local dev server with 1Password secrets
vp run types:cf               # Generate Cloudflare bindings types (CloudflareBindings interface)
vp run types:tsc              # Run TypeScript type check (tsc --noEmit)
vp run proxy                  # Start cloudflared tunnel for local dev

# Testing
vp run test                   # Run all Vitest tests
vp run test test/ao3-parser.test.ts           # Run specific test file
vp run test -t "should parse work title"      # Run tests matching pattern

# Deployment
vp run deploy:dev             # Deploy to dev environment
vp run deploy:prod            # Deploy to production

# Database
vp run db:generate            # Generate Drizzle migrations
vp run db:migrate             # Run Drizzle migrations with visible, credential-redacted errors
vp run db:push                # Push schema changes directly

# Linting
vp run biome:check:unsafe     # Fix linting issues with unsafe fixes
vp run biome:ci               # CI linting check (used in GitHub Actions)
```

## Architecture

### Runtime & Deployment

- Cloudflare Workers with Node.js compatibility mode
- PlanetScale MySQL database via `@planetscale/database`
- Environments: `local`, `dev`, `prod` (configured in `wrangler.json`)
- Production deployments use the root reusable [API workflow](../../.github/workflows/deploy-api.yml), called with the exact commit SHA that passed CI. Successful push CI on current `dev` runs [Release dev](../../.github/workflows/deploy-dev-api.yml): deploy the development Worker, check `/ping`, then release the Android Dev app and Chrome Beta extension. See [development deployment setup](../../docs/store-releases.md#api-development) for secrets and activation.

### Production deployment readiness

The `api-production` GitHub environment needs `CLOUDFLARE_API_TOKEN` and a `DATABASE_URL` with migration permissions pointing to the same production database used by the Worker. The Cloudflare account ID is already in `wrangler.json`. Scope the token to the configured account and production zone with Worker deployment and required binding/route permissions. Provision the production R2 bucket, notification/dead-letter queues, email sender, and Worker runtime secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_ID`, `GOOGLE_SECRET`, `FCM_SERVICE_ACCOUNT`) separately. Wrangler preserves existing Worker secrets; the GitHub database credential is used for migrations and is not uploaded.

The workflow rejects a source SHA that is no longer current `main`, including reruns of failed deployment jobs. After deployment it checks the public `/ping` response. This smoke test checks routing and Worker startup; it does not identify the deployed revision or test authenticated database operations.

After downloading the built API artifact and checking the source is still current, the protected deployment job runs `vp node apps/api/scripts/migrate.mjs` from the repository root. Drizzle applies pending migrations from that source commit and records them in `ao3track__migrations`. Development uses the same sequence with `DEV_DATABASE_URL`; it never falls back to production credentials. Migration failures stop API deployment and dependent store releases.

Review pending SQL before merging: migrations run before the new Worker is deployed and must remain compatible with the currently deployed code. DDL is not transactionally rolled back. If a migration fails or the database was changed outside Drizzle, inspect the live schema and reconcile its history only after confirming which changes are already applied; CI does not baseline history. Each migration lives in `src/db/migrations/<UTC timestamp>_<name>/` with `migration.sql` and `snapshot.json`; there is no journal.

### Native diagnostics

`POST /ingest` is public and runs before auth/database middleware. It accepts only the strict `@qcksys/ao3tracker-core/diagnostics` schema, caps bodies at 2 KiB, and uses `DIAGNOSTICS_RATE_LIMITER` (120 requests per minute per IP). It constructs a PostHog Capture API request without forwarding client headers, credentials, IPs or arbitrary properties. Do not turn it into a general-purpose proxy or add reading data to the schema.

`POST /ingest/native/batch/` proxies SDK crash batches only (`$exception`, up to 50 events and 1 MiB after optional gzip decompression). Preserve UUIDs, timestamps, exception payloads and release metadata for deduplication and symbolication. Strip unrelated properties and request headers; enforce server environment, disabled person profiles and GeoIP. `GET /ingest/native/array/:token/config` proxies remote crash configuration. Both routes substitute the server project token and use fixed regional upstreams. Missing tokens, network failures and upstream errors return 503; throttling returns 429. Only acknowledge batches accepted upstream so the SDK retains failed deliveries. Other SDK endpoints remain unavailable.

`POSTHOG_PROJECT_TOKEN` is an encrypted Worker secret, provisioned separately for each environment; never put it in source or the native app. `POSTHOG_REGION=eu` selects EU ingestion. QckSys projects are `ao3tracker-dev` (291114) for `ao3tracker-api-dev`, and `ao3tracker` (69100) for `ao3tracker-api-prod`. Local tests use inert tokens and mock fetch. For local live checks, supply a development token through the existing secret-loading mechanism. Keep exception autocapture enabled in each project. Deploy the Worker before releasing the native client; see [native diagnostics](../native-kmp/AGENTS.md#diagnostics).

### Browser work checker

`/checker/*` ([routes/checker.ts](src/routes/checker.ts), logic in [lib/work-checker.ts](src/lib/work-checker.ts)) serves the self-hosted browser container in [apps/work-checker](../work-checker/AGENTS.md), which loads AO3 pages because most Worker requests to AO3 fail. The container initiates every request; the Worker never contacts it. The router mounts before the session and database middleware and authenticates a bearer token against the `WORK_CHECKER_TOKEN` secret; an unset secret rejects every request.

- Settings are the `work_checker` row of `ao3track__app_setting` (one JSON value per key, read on every cron run and checker request), parsed with the shared `@qcksys/ao3tracker-core/work-checker` schema. Change them with SQL against the environment's database; no deployment is needed:
  ```sql
  INSERT INTO ao3track__app_setting (`key`, value)
  VALUES ('work_checker', '{"enabled":true,"pollIntervalSeconds":300,"maxWorksPerPoll":12,"delayBetweenRequestsMs":2000}')
  ON DUPLICATE KEY UPDATE value = VALUES(value), rowDeletedAt = NULL;
  ```
  Admins can also change them at `/admin/settings` (see [Admin site](#admin-site)). A missing, soft-deleted or invalid value means disabled (invalid values are logged). While `enabled` is true, the cron skips `refreshStaleWorks` and `fetchMissingWorks`; notification dispatch still runs. `test/e2e/app-setting.test.ts` runs this statement against MySQL.
- Results go through the cron's own handlers: `parseWorkPageHtml`/`completeWorkData` parse the HTML, then `handleRefreshResult` (stored work) or `handleFetchResult` (missing work) apply it, so notifications, soft-deletes and failure backoff behave identically. A stored work's chapter growth returns `needs_chapter_index` instead of applying a page without chapter dates.
- Backups: the checker downloads the formats the result response lists and uploads them; only the work's current `downloadUpdatedAt` revision is stored.
- Provision `WORK_CHECKER_TOKEN` in each environment before deploying: it is in `secrets.required`.

### Admin site

`/admin` ([routes/admin.tsx](src/routes/admin.tsx), views `src/views/admin-*.tsx`) is a server-rendered dashboard and settings page for administrators.

- **Admins**: `ao3track__auth_user.role = 'admin'`. `role` is a Better Auth `additionalField` with `input: false`, so no sign-up or update request can set it; grant it with SQL (`UPDATE ao3track__auth_user SET role = 'admin' WHERE email = ...`).
- **Guard** (`requireAdminMw`): no session redirects to `/admin/sign-in?next=...` (only `/admin` paths are accepted as `next`); a non-admin gets 403; every non-GET request must carry `Origin` equal to `BETTER_AUTH_URL`'s origin, since session cookies are SameSite=Lax. Responses are `no-store` and `noindex`.
- **Sign-in** uses Better Auth's own endpoints from an inline script: `/auth/sign-in/email`, then `/auth/two-factor/verify-totp` when the response has `twoFactorRedirect`; or a passkey via `/auth/passkey/generate-authenticate-options` and `/auth/passkey/verify-authentication`, using the browser's `PublicKeyCredential.parseRequestOptionsFromJSON` and `credential.toJSON()` (no client library). Passkeys work on the origin of `BETTER_AUTH_URL`, which is the site's own.
- **Dashboard** counts come from `getAdminStats` (`src/db/queries/admin-stats.ts`), one aggregate query each. "Refreshed in the last hour" requires `refreshFailures = 0`: refresh leases and failure backoff also move `lastRefreshed`, but only a success sets it to now with no failures. It also shows each work checker's latest status (below) and flags one silent for more than two poll intervals plus five minutes.
- **Settings** edits the `work_checker` setting; the form re-renders with the submitted values on a validation error and redirects with `?saved=1` on success.
- **Checker status**: `POST /checker/status` (checker token) stores the latest report per `checkerId` in `ao3track__work_checker_status` (JSON `status` plus the Worker's receive time `reportedAt`). The shape is the shared `workCheckerStatusSchema`.

### Framework Stack

- **Hono** - Web framework with OpenAPI support via `@hono/zod-openapi`
- **Drizzle ORM** - Database ORM with Zod schema generation (`drizzle-orm/zod`)
- **Better Auth** - Authentication with email/password, Google OAuth, passkeys, and 2FA
- **Zod** - Schema validation
- **Scalar** - OpenAPI documentation UI (`@scalar/hono-api-reference`)
- **Vitest** - Testing framework with `@cloudflare/vitest-plugin`

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
- Work summaries use `@qcksys/ao3tracker-core/work-summary` to match client extraction: retain all work-summary text up to 2,048 Unicode code points after whitespace normalization, excluding chapter summaries. Accumulate every HTMLRewriter text chunk; `lastInTextNode` does not mark the end of a summary.
- `parseChapterIndex()` - Extracts chapter list from navigate pages
- `fetchAndParseWork()` / `fetchAndParseChapterIndex()` - Fetch and parse helpers

**Scheduled Tasks** (`src/scheduled/`):

- `handler.ts` - Cron dispatcher, runs every 5 minutes (`*/5 * * * *`); AO3 fetching is skipped while the [browser work checker](#browser-work-checker) is enabled
- `refresh-works.ts` - Refreshes stale work data (not refreshed in 6 hours). Fetches one work at a time, up to 12 per run within a 4-minute budget so consecutive 5-minute runs do not overlap. Each work is claimed least recently refreshed first by moving `lastRefreshed` to 30 minutes past the stale threshold without touching `rowUpdatedAt`; overlapping runs skip claimed works. A failed fetch increments `refreshFailures` and retries after 30m, 1h, 2h, 4h, then 6h; success resets it. A 5xx, 429, timeout or network error (`isAo3Unavailable`) ends the run, because AO3 is failing rather than the work. Apply `20261027042301_work-last-refreshed-index` and `20261027180739_work-refresh-failures` with this change; `refreshFailures` is excluded from sync metadata. Fetches the first-chapter work view, not `view_full_work`: only that view has the `select#selected_id` chapter dropdown, and the full view renders every chapter. Downloads
  and backs up each format to R2 (after `handleRefreshResult`, which leaves backups to its caller) if `downloadUpdatedAt` is newer than that format's latest active backup's `ao3UpdatedAt`. Failed formats retry on the next refresh even when another format already succeeded. Creates notifications
  for new chapters, work completion, deletion, and restriction.
- `fetch-missing-works.ts` - Fetches data for tracked works missing from the works table (up to 12 works/run)
- `work-fetcher.ts` - Shared utilities for fetching and parsing AO3 work pages. A successful response without a work title or a chapter count of at least 1 is a failed fetch (retried later), not a work: maintenance and other interstitial pages arrive with a 200 status. The exception is AO3's placeholder for an unrevealed work ("Mystery Work", a `#main p.notice` saying it "will be revealed soon"; `isUnrevealedWorkPage`): `UnrevealedWorkError` / `unrevealed: true`. A stored work keeps its metadata, resets `refreshFailures` and is checked again after the normal interval (`recordWorkUnrevealed`), with no notification; a missing tracked work stays missing and is fetched again later.

**Notification System** (`src/lib/notification-service.ts`, `src/db/queries/notification.ts`):

- Creates notification records when works are updated (new chapters, completion, deletion, restriction)
- Event creation uses a unique `(userId, workId, type, eventKey)` index and a no-op upsert. Chapter/completion events use the target chapter count, independent of the old count or title; deletion/restriction events use `state` until a successful scheduled fetch clears that key to end the unavailable episode. Do not restore a time-window deduplication check: it allows concurrent inserts and delayed repeats while suppressing distinct updates. Apply `20261007120227_notification-event-identity` before deploying this API. Existing history rows retain null keys and are preserved.
- Outbox dispatchers atomically claim pending rows for five minutes before sending. Only the claim owner may acknowledge or release them; failed sends release their claims, and abandoned claims become retryable after expiry. A duplicate event upsert must not reset delivery state or timestamps.
- New notification rows set `dispatchPending` before attempting Cloudflare Queue (`NOTIFICATION_QUEUE`) handoff. Clear it only after the queue accepts the batch; cron retries pending rows every five minutes even when work metadata has no further changes. Apply `20261002000754_notification-dispatch-outbox` before deploying the API; its false default keeps historical notifications out of the retry queue. Queue handoff remains at least once if acknowledgement persistence fails.
- User batches fan out into one queued delivery per `(userId, deviceId)`. Failed device deliveries retry with the queue's retry budget and dead-letter queue; successful devices are acknowledged independently. An FCM `UNREGISTERED` response invalidates the token and is acknowledged. Queue delivery remains at least once.
- Android delivery uses channel `ao3_work_updates`, click action `com.qcksys.ao3tracker.OPEN_WORK`, and a string `workId` data field. Keep the native manifest and notification navigation parser aligned with these values.
- Only notifies users who have `subscribed = true` for the work (default is `true`)
- Notification types: `new_chapters`, `work_completed`, `work_restricted`, `work_deleted`. Device preferences use the shared `@qcksys/ao3tracker-core/notifications` schema: `enabled` plus one boolean per type, all defaulting to true.
- `POST /api/push/token` accepts optional `notificationPreferences` and echoes accepted preferences in its response. Omission preserves existing device settings; a null database value means all alerts enabled. Delivery checks current preferences for the selected device on every attempt, including retries. History remains available regardless of delivery preferences. Apply `20261001231352_device-notification-preferences` before deploying the API and release the API before the native client.

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
- Schema naming convention: `tTableName` for tables, `sTableNameS/I/U` for
  select/insert/update Zod schemas
- `src/db/schema/index.ts` collects tables; `src/db/relations.ts` defines all relations with `defineRelations`. Relation names must not collide with column names (`workRecord`/`tagRecord` on tag links). The client uses `drizzle({ client, relations })`.
- Relational queries use object filters and ordering, e.g. `where: { workId, rowDeletedAt: { isNull: true } }` and `orderBy: { rowCreatedAt: "desc" }`.
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
  Exception: tables with auto-increment primary keys where you always want new records. Work notifications use an event key and must be upserted without changing an existing row.
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
- `.env.schema` - Tracked Varlock schema with one 1Password reference to a Secure Note containing the local dotenv text; see [setup](README.md#local-secrets-in-1password). Package scripts use `varlock run`; keep plaintext values in 1Password and declare new keys in the schema. Remove legacy `.dev.vars` files after verifying their secrets in 1Password, since Wrangler gives those files precedence over injected values. Keep `secrets.required` synchronized across Wrangler environments so generated types retain the secret bindings; deployments validate the names against existing Cloudflare secrets.
- `drizzle.config.ts` - Drizzle Kit config (reads from env vars via `src/env.ts`)
- `better-auth.config.ts` - Better Auth configuration
- `vitest.config.ts` - Vitest configuration with Cloudflare Workers pool

### Testing

- Test files in `test/` directory
- Uses `@cloudflare/vitest-plugin` for Workers-compatible testing with local Miniflare options; tests do not load deployment bindings or secrets
- `@cloudflare/vitest-plugin` 1.4 supports Vitest 5, so the API uses the catalog `vitest` version. Keep API tests and `vitest.config.ts` importing `vitest`/`vitest/config`, and run them through the package's `test` script. Check the plugin's `vitest` peer range before upgrading Vitest. `vitest.config.ts` disables `fsModuleCache`: with it on, the plugin sends cached modules in one WebSocket message that exceeds workerd's 32 MiB limit and crashes the pool ([workers-sdk#16349](https://github.com/cloudflare/workers-sdk/issues/16349)). Re-enable it only after that issue is fixed.
- Fixtures in `test/*.fixtures.ts`
- Coverage includes AO3 parsing, sync conflict/cursor regressions, notification retries, partial backups, and auth origins

### Database dependency compatibility

Drizzle ORM and Kit are pinned together at `1.0.0-rc.5`. Keep `@planetscale/database` on 1.x: driver 2.x removes the parameterized `execute` API the RC adapter still requires. RC.5 relational queries throw on `undefined` filter values; use `EmptyFilter` from `drizzle-orm/relations` for an intentionally absent filter. `test/db-client.test.ts` and `test/backup-queries.test.ts` exercise the real adapter with mocked HTTP responses; root migration tests exercise the real migrator. The `db:migrate` script uses the checked-in migration folders and `ao3track__migrations` ledger, with credential-redacted error causes.

Drizzle Kit RC renders `timestampCols`' `rowUpdatedAt` default as `DEFAULT (CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`, which MySQL rejects. When a generated `CREATE TABLE` uses `timestampCols`, edit its SQL to `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` (as in `20261028080354_app-setting`), and run `vp run test:e2e`, which applies every migration to MySQL 8.

The first RC migration run, in CI or via local `vp run db:migrate`, upgrades a legacy ledger by adding `name` and `applied_at`, backfilling names, and then applying pending SQL. Deployment database credentials require DDL and write access for this runner. The repository format conversion preserves historical SQL. `drizzle.config.ts` forces UTC to avoid RC.4's mixed local-year/UTC migration-name bug at New Year.

### Authentication dependency upgrades

Better Auth and its passkey plugin use the same catalog version. Better Auth 1.7 requires `verified`, `failedVerificationCount`, and `lockedUntil` on the two-factor table. Apply migration `20260930103837_auth-two-factor-lockout/migration.sql` before deploying this upgrade; its verified default preserves existing enrollments. Auth-origin tests instantiate the real adapter and check that its declared schema remains compatible.

### Authentication origins

Native passkeys send credential responses as JSON objects, retain the signed challenge cookie between options and verification, and use the selected API origin in the HTTP `Origin` header. Passkey assertion origins and Digital Asset Links both derive from the package-specific certificates in `src/lib/android-app.ts`. Production associates only the production package with its Play signing and sideload/upload certificates. Local/dev retains debug and sideloaded builds and associates the dev Play certificate only with the dev package; neither environment accepts the other environment's Play signing key. When updating certificates, use **App signing key** from the matching [production](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974343187457150951/keymanagement) or [dev](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974701134454351254/keymanagement) Play listing: its upload certificate does not identify Play-installed APKs. Never trust an origin supplied inside an assertion without validating it against the configured list.

Dev builds append the exact `chrome-extension://<CHROME_BETA_EXTENSION_ID>` origin through the Cloudflare Vite plugin when that repository variable is configured. Production builds ignore it. The beta extension defaults to and permits only `https://dev.ao3tracker.com`; its release helper verifies the live dev API CORS response before uploading. Configure the beta item ID before running `Release dev`; do not allow arbitrary extension origins.

Auth rate limiting uses database storage in every environment. Client IP detection trusts only Cloudflare's `CF-Connecting-IP` header; do not add caller-controlled forwarded headers. Origin tests use Better Auth's real memory limiter within each test fixture, while asserting the production configuration remains database-backed and enabled.

`ALLOWED_ORIGINS` supplies both CORS and Better Auth origin validation. The Chrome Web Store listing and manifest public key use ID `hjonebiohecalkggemeneaaohafldkkl`, explicitly allowed in local/dev/prod. The previous unpacked development ID `blgkokkfdhkkgaghemkodncmjfjbpjdc` remains allowed for existing development installs. Deploy the matching API origin configuration before releasing the extension. The WXT Firefox development profile pins runtime UUID `9f7fd2ce-5e43-4d3e-9d4e-92f89126df55`, allowed only in local/dev. Firefox's add-on ID (`ao3tracker@qcksys.com`) does not identify its per-install HTTP origin. Signed Firefox distribution needs a hosted authentication flow or another explicit origin strategy before release; do not add a blanket extension wildcard.

### Code Style

- Formatting uses workspace-root Oxfmt (`vp fmt`) with two-space indentation and double quotes. Biome formatting is disabled to avoid conflicting output.
- Imports organized automatically via Biome
- Husky pre-commit hook runs `vp run biome:ci`
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
- Sync timestamps use `datetime(3)`. Migration `20260930095035_sync-mutation-cursors/migration.sql` upgrades precision. Client storage migrations reset the old event-time cursor once. Full sync includes all tombstones so an existing client can safely reconcile after resetting its cursor.

**Per-Field Last-Write-Wins (LWW) Conflict Resolution**:

The sync uses LWW independently for each field group:

| Field Group                                 | Compared Using        | Notes                                           |
| ------------------------------------------- | --------------------- | ----------------------------------------------- |
| `lastReadAt`, `markedCompleteAt`, `private` | `lastReadAt`          | Reading progress fields                         |
| `subscribed`                                | `subscribedUpdatedAt` | Explicit timestamp (falls back to `lastReadAt`) |
| `favourite`                                 | `favouriteUpdatedAt`  | Explicit timestamp (falls back to `lastReadAt`) |

This enables multi-device sync where toggling `favourite` on Device A won't be overwritten when Device B syncs reading
progress. Server wins on timestamp tie. See `src/db/helpers/lww.ts` for the `resolveLWW()` helper.

Chapter uploads accept optional `deleted` (default `false`). A chapter tombstone or restore uses `lastReadAt` as its mutation clock, and only a strictly newer mutation replaces persisted state. Accepted chapter deletions retain the existing `accepted` response status. When a single-chapter work gains real chapter IDs, copy chapter zero to the first chapter under LWW and publish a zero tombstone with the original event timestamp. A later offline read or deletion of zero maps to the first chapter; replaying the migration tombstone cannot overwrite equal or newer canonical progress.

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
- **Additive contract**: all `savedSearches` fields are optional, so existing clients (incl. the native app, which ignores unknown keys) keep working unchanged. Implementation: `src/db/schema/user.savedSearch.ts`, `src/db/queries/user-saved-search.ts`, migration `20260623113431_shiny_black_cat/migration.sql`.
