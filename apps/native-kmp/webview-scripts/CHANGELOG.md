# ao3tracker-webview-scripts

## 1.0.1

### Patch Changes

- e524c4a: Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

  Upgrade Drizzle ORM and Kit to 1.0.0-rc.4, migrate the PlanetScale client and relational queries, and use Drizzle's built-in Zod schema generation. Keep the PlanetScale driver on the compatible 1.x line. Report migration failures with their underlying causes while redacting connection credentials.

  Convert migration files to timestamped folders without changing historical SQL. The deployment check supports both legacy and RC migration ledgers and remains read-only. The first manual RC migration run adds and backfills the ledger's `name` and `applied_at` columns before applying pending SQL; review pending migrations and use PlanetScale's schema-change process before running it.

  Apply API migration `20260930103837_auth-two-factor-lockout` (formerly `0012`) before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.

- Updated dependencies [25eabd5]
- Updated dependencies [e524c4a]
- Updated dependencies [e524c4a]
  - @qcksys/ao3tracker-core@0.1.0
