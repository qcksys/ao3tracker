---
"@qcksys/ao3tracker-api": minor
---

Harden the API against the risks surfaced in the codebase review:

- **Backups** are no longer handed out as public, unauthenticated R2 bucket
  URLs. `GET /api/backup/:workId` now returns a relative `downloadPath` instead
  of `url`, and a new authenticated `GET /api/backup/:workId/file/:filename`
  route streams the object from R2 after an ownership (`isUserTrackingWork`)
  check. The unused `WORK_BACKUPS_BUCKET_URL` var is removed. NOTE: the R2
  bucket's public custom domain should also be disabled at the infrastructure
  level so objects are only reachable through this authenticated route.
- **Rate limiting** added on all `/api/*` routes (per-user, via the Cloudflare
  `ratelimit` binding `API_RATE_LIMITER`), with a stricter limit on the
  outbound AO3-proxy routes (`/api/parse/*` and backup creation) via
  `AO3_PROXY_RATE_LIMITER`.
- **CORS** is no longer a wildcard: it now reflects only origins in the new
  `ALLOWED_ORIGINS` env var.
- **Better Auth** `trustedOrigins` is now configured from `ALLOWED_ORIGINS`,
  and the origin/CSRF check is only disabled for the `local` environment
  (previously also disabled on the publicly-routed `dev` deployment).
- **Auth email logs** no longer record recipient email addresses (PII); they
  log the user id instead.
- **Queue handler** now processes every message in a batch instead of returning
  after the first (previously dropped notifications 2..N).
- **Delivery retries** now run independently per device. Transient FCM failures
  retry and exhausted attempts go to the configured dead-letter queue; expired
  tokens are parsed from the response and invalidated.
- **Partial backups** retry missing formats even when another format already
  has a current backup.

Notes:

- The `GET /api/backup/:workId` field rename (`url` → `downloadPath`) is a wire
  change but no shipped client consumes the backup endpoints, so this is
  released as a `minor` rather than `major` bump.
- `/api/parse/*` remains an authenticated AO3 fetch proxy open to any tracked
  account (not gated on tracking a specific work) — this is intentional to
  support previewing a work before tracking it; abuse is now bounded by the
  `AO3_PROXY_RATE_LIMITER` (30/min/user).
- `ALLOWED_ORIGINS` feeds both CORS and Better Auth `trustedOrigins` and includes
  the stable unpublished Chrome extension identity. A fixed Firefox development
  UUID is allowed in local/dev only; signed Firefox distribution needs an
  authentication origin strategy before publication.
