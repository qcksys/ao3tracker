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

| Endpoint | Description |
|----------|-------------|
| `GET /` | Landing page |
| `GET /ping` | Health check |
| `GET /openapi` | Interactive API documentation (Scalar UI) |
| `GET /llms.txt` | API docs in markdown for LLMs |

### Authentication (`/auth/*`)

Better Auth handles all auth endpoints including sign-in, sign-up, password reset, OAuth, passkeys, and 2FA.

### Protected (`/api/*`)

| Endpoint | Description |
|----------|-------------|
| `GET /api/parse/{workId}` | Parse work metadata and tags from AO3 |
| `GET /api/parse/{workId}/chapters` | Parse chapter index from AO3 |
| `GET/POST /api/track/sync` | Bidirectional sync of tracked works/chapters |
| `GET /api/notifications` | Get notification history with cursor pagination |
| `POST /api/backup` | Create work backup (html/pdf/mobi/epub/azw3) |
| `GET /api/backup/{workId}` | List backups for a work |

## Development

### Prerequisites

- Node.js 24+ (via Volta)
- pnpm 10+
- Cloudflare account
- PlanetScale database

### Setup

```bash
# Install dependencies
pnpm install

# Generate Cloudflare bindings types
pnpm types:cf

# Create .dev.vars with required secrets
cp .dev.vars.example .dev.vars

# Start local dev server
pnpm dev

# Optional: Start cloudflared tunnel for HTTPS
pnpm proxy
```

### Commands

```bash
# Development
pnpm dev                  # Start local dev server
pnpm types:cf             # Generate Cloudflare bindings types
pnpm types:tsc            # Run TypeScript type check

# Testing
pnpm test                 # Run all tests
pnpm test -- test/lww.test.ts              # Run specific test file
pnpm test -- -t "should parse"             # Run tests matching pattern

# Database
pnpm db:generate          # Generate Drizzle migrations
pnpm db:migrate           # Run migrations
pnpm db:push              # Push schema directly (dev only)

# Deployment
pnpm deploy:dev           # Deploy to dev environment
pnpm deploy:prod          # Deploy to production

# Linting
pnpm biome:check:unsafe   # Fix linting issues
pnpm biome:ci             # CI linting check
```

### Environment Variables

Required in `.dev.vars` (local) or Cloudflare dashboard (deployed):

- `DATABASE_URL` - PlanetScale connection string
- `BETTER_AUTH_SECRET` - Auth secret key
- `MAILERSEND_API_KEY` - For transactional emails
- `GOOGLE_ID` / `GOOGLE_SECRET` - For Google OAuth (optional)

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

| Field Group | Compared Using |
|-------------|----------------|
| `lastReadAt`, `markedCompleteAt`, `private` | `lastReadAt` |
| `subscribed` | `subscribedUpdatedAt` (fallback: `lastReadAt`) |
| `favourite` | `favouriteUpdatedAt` (fallback: `lastReadAt`) |

This allows independent sync of reading progress and preferences across multiple devices without conflicts.

## Deployment

Auto-deploys via GitHub Actions:
- `dev` branch -> dev environment
- `main` branch -> production

## License

MIT
