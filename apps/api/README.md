# AO3 Tracker API

A Cloudflare Workers REST API for tracking Archive of Our Own (AO3) fanfiction works. Track reading progress, sync across devices, receive push notifications for updates, and automatically backup works.

## Tech Stack

- **Runtime**: Cloudflare Workers (Node.js compatibility)
- **Framework**: [Hono](https://hono.dev/) with OpenAPI support
- **Database**: PlanetScale MySQL via Drizzle ORM
- **Auth**: [Better Auth](https://better-auth.com/) (email/password, Google OAuth, passkeys, 2FA)
- **Storage**: Cloudflare R2 for work backups
- **Queue**: Cloudflare Queues for push notification delivery

## API Endpoints

### Public

| Endpoint        | Description                               |
| --------------- | ----------------------------------------- |
| `GET /`         | Landing page                              |
| `GET /ping`     | Health check                              |
| `GET /openapi`  | Interactive API documentation (Scalar UI) |
| `GET /llms.txt` | API docs in markdown for LLMs             |

### Authentication (`/auth/*`)

Better Auth handles all auth endpoints including sign-in, sign-up, password reset, OAuth, passkeys, and 2FA.

### Protected (`/api/*`)

| Endpoint                           | Description                                     |
| ---------------------------------- | ----------------------------------------------- |
| `GET /api/parse/{workId}`          | Parse work metadata and tags from AO3           |
| `GET /api/parse/{workId}/chapters` | Parse chapter index from AO3                    |
| `GET/POST /api/track/sync`         | Bidirectional sync of tracked works/chapters    |
| `GET /api/notifications`           | Get notification history with cursor pagination |
| `POST /api/backup`                 | Create work backup (html/pdf/mobi/epub/azw3)    |
| `GET /api/backup/{workId}`         | List backups for a work                         |

## Development

### Prerequisites

- Node.js 24, managed by Vite+ using the root `package.json` → `engines.node` pin
- Vite+ (`vp`); it manages the pinned pnpm backend
- 1Password desktop app and [1Password CLI](https://developer.1password.com/docs/cli/get-started/), with desktop app integration enabled
- Cloudflare account
- PlanetScale database

### Setup

```bash
# Install dependencies
vp install

# Generate Cloudflare bindings types
vp run types:cf

# Configure the single 1Password reference in .env.schema as described below

# Start local dev server
vp run dev

# Optional: Start cloudflared tunnel for HTTPS
vp run proxy
```

### Local secrets in 1Password

Run the setup commands from `apps/api/`. [Varlock's 1Password plugin](https://varlock.dev/plugins/1password/) loads the complete local environment from one Secure Note. The tracked [`.env.schema`](.env.schema) contains one `op://.../notesPlain` reference and the expected variable names; it contains no secret values.

1. Open and unlock the 1Password desktop app, enable **Settings → Developer → Integrate with 1Password CLI**, and check `op whoami` succeeds.
2. The configured reference points to the `ao3tracker-api .dev.vars` Secure Note in the `QckSys` vault, which stores the entire local `.env` text. It uses vault/item IDs so renaming the note does not break the reference. To use a different note, replace the reference with its **Copy Secret Reference** value. Commit the reference in `.env.schema`, keeping the values in 1Password.
3. Include `DATABASE_URL` and `BETTER_AUTH_SECRET` in the note. Use the development database connection. `GOOGLE_ID`, `GOOGLE_SECRET`, and `FCM_SERVICE_ACCOUNT` are optional locally. For FCM, put the JSON in a single-quoted dotenv value so its JSON escapes are preserved. Quote literal `$` characters with single quotes; bulk imports do not evaluate shell commands or variable references. Declare additional variable names in `.env.schema` when the API needs them; unknown keys in the note are ignored.
4. If migrating an existing checkout, verify the stored values in 1Password before removing the old `.dev.vars` and `.dev.vars.*` files. Wrangler loads those files ahead of the injected process environment. Remove any remaining plaintext secrets from `.env*` files too.
5. Run `vp run dev` here or at the repository root. Approve the 1Password unlock prompt if shown.

The dev server, preview, database commands, and Better Auth schema generator use [`varlock run`](https://varlock.dev/reference/cli/load-and-run/) with [`@setValuesBulk`](https://varlock.dev/reference/root-decorators/#setvaluesbulk). Varlock resolves the note through the installed 1Password CLI, parses its dotenv content, validates required variables, and injects the child process environment. No custom loader or plaintext secret file is needed. The schema uses in-memory caching and marks all values sensitive. Existing process variables and local `.env` overrides take precedence, so clear stale overrides when switching to 1Password. Restart the command after changing the note. `vp run preview` requires a prior local `vp run build`.

Wrangler's [`secrets.required`](https://developers.cloudflare.com/workers/configuration/secrets/) list selects which injected values become local Worker bindings and generates their types without reading a vault. Empty optional values keep the corresponding integrations unavailable. Keep reference files out of the extension and native app: these secrets belong to the API. Builds, tests, type generation, and CI do not require 1Password. Deployments continue using secrets configured in Cloudflare and check that the declared secret names exist there.

Run builds outside `varlock run`: the Cloudflare Vite plugin can copy secrets present during a build into `dist/ssr/.dev.vars` for preview. If a previous build generated that file, remove it after confirming its secrets are stored in 1Password and rebuild without injected secrets before using preview.

### Commands

```bash
# Development
vp run dev                  # Start local dev server
vp run types:cf             # Generate Cloudflare bindings types
vp run types:tsc            # Run TypeScript type check

# Testing
vp run test                 # Run unit tests without Docker
vp run test:e2e             # Build the Worker and run seeded MySQL sync tests (Docker required)
vp run test test/lww.test.ts              # Run specific test file
vp run test -t "should parse"             # Run tests matching pattern

# Database
vp run db:generate          # Generate Drizzle migrations
vp run db:migrate           # Run migrations
vp run db:push              # Push schema directly (dev only)

# Deployment
vp run deploy:dev           # Deploy to dev environment
vp run deploy:prod          # Deploy to production

# Linting
vp run biome:check:unsafe   # Fix linting issues
vp run biome:ci             # CI linting check
```

### Seeded sync end-to-end tests

Start Docker Desktop (Linux containers) or another Docker-compatible runtime, then run `vp run test:e2e` from the repository root or this package. The command builds the API with Vite+, starts disposable MySQL 8.0 and [PlanetScale HTTP simulator](https://github.com/mattrobenolt/ps-http-sim) containers with Testcontainers, applies every checked-in migration through the normal migration script, and starts the built Worker locally with Wrangler's test harness. The shared sync client sends real HTTP requests through authentication, routing, validation, and the production PlanetScale/Drizzle adapter. No cloud or 1Password credentials are required.

Each test clears and reseeds its isolated database with two readers, sessions, tracked works and chapters, metadata, favourite tags, saved searches, and tombstones. Coverage includes full and paginated pulls, incremental discovery, offline pushes, per-field conflicts, mark-unread resets, deletion propagation, retries, legacy chapter IDs, account isolation, and invalid requests. Database reads also verify persisted state. Containers and the Worker are stopped after the suite, including on setup failure; Docker failures fail the suite rather than skipping it.

The first run downloads the container images. CI runs this suite in the workspace checks job; `vp run -r test` remains Docker-free. Tests live in `test/e2e/` with a separate Node/DOM TypeScript configuration because the shared browser client and the Worker have different global types. `vp run types:tsc` checks both configurations. The simulator exercises real MySQL queries but does not reproduce PlanetScale's hosted Vitess infrastructure.

### Environment Variables

Loaded from 1Password for local development, or the Cloudflare dashboard for deployed Workers:

- `DATABASE_URL` - PlanetScale connection string
- `BETTER_AUTH_SECRET` - Auth secret key
- `GOOGLE_ID` / `GOOGLE_SECRET` - For Google OAuth (optional)
- `FCM_SERVICE_ACCOUNT` - Full Firebase service-account JSON for push notifications (optional locally)

Transactional emails (password reset, email verification) are sent via the
Cloudflare Email Sending binding `EMAIL` defined in `wrangler.json`. No
secret needed — the binding authenticates via the worker itself.

## Architecture

```
src/
├── index.ts           # Entry point, middleware chain
├── routes/            # API route handlers
│   ├── api.parse.ts   # AO3 parsing endpoints
│   ├── api.track.ts   # Sync endpoints
│   └── api.backup.ts  # Backup endpoints
├── db/
│   ├── schema/        # Drizzle table definitions
│   └── queries/       # Database query functions
├── middleware/        # Hono middleware
├── lib/               # Utilities (parser, auth, email)
└── scheduled/         # Cron job handlers
```

### Scheduled Tasks

Runs every 5 minutes:

- **Refresh Works**: Updates stale work metadata from AO3 (12 works/run), creates notifications for new chapters/completion/deletion
- **Fetch Missing Works**: Populates data for newly tracked works (12 works/run)

### Sync Protocol

The sync API uses cursor-based pagination with per-field Last-Write-Wins (LWW) conflict resolution:

| Field Group                                 | Compared Using                                 |
| ------------------------------------------- | ---------------------------------------------- |
| `lastReadAt`, `markedCompleteAt`, `private` | `lastReadAt`                                   |
| `subscribed`                                | `subscribedUpdatedAt` (fallback: `lastReadAt`) |
| `favourite`                                 | `favouriteUpdatedAt` (fallback: `lastReadAt`)  |

This allows independent sync of reading progress and preferences across multiple devices without conflicts.

## Deployment

Auto-deploys via GitHub Actions:

- `dev` branch -> dev environment
- `main` branch -> production

## License

MIT
