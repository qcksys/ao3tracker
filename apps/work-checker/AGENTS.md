# AGENTS.md

Canonical guidance for AI coding agents working in `apps/work-checker/`. `CLAUDE.md` next to this file is a symlink to it.

## Purpose

A self-hosted Docker container that loads AO3 work pages in a real browser and reports them to the API Worker. AO3 fails most requests from the Worker (525s, timeouts, 429s from Cloudflare's network); the container connects from the host's own IP and runs headful Google Chrome, so AO3 sees an ordinary browser.

The container **pulls everything**: it polls the Worker for settings and jobs and posts results back. The Worker never contacts it, so it needs no inbound port, tunnel or public address.

## Commands

```bash
vp run test        # Vitest, with the browser and Worker API mocked
vp run typecheck   # tsc --noEmit
docker build --platform linux/amd64 -f apps/work-checker/Dockerfile -t ao3tracker-work-checker .   # from the repo root
```

## Architecture

- `src/main.ts`: poll loop. Reads settings, runs a poll, waits `pollIntervalSeconds`. SIGTERM ends a poll between requests.
- `src/checker.ts`: one poll. Claims jobs, checks them one at a time with `delayBetweenRequestsMs` between AO3 requests, and ends the poll on the first `unavailable` outcome.
- `src/browser.ts`: the only browser code. [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs), a Playwright fork that removes its automation signals, drives installed Google Chrome with a persistent profile at `PROFILE_DIR` (a volume, so Cloudflare's clearance cookie survives restarts). Follow Patchright's guidance: `channel: "chrome"`, headful, `viewport: null`, and no user agent, header, locale or launch-flag overrides. It waits out a `Just a moment...` challenge and reloads for the page's real status.
- Backups download through Chrome itself (navigate, then save the `download` event's file). AO3 redirects downloads to `download.archiveofourown.org`, whose Cloudflare challenge rejects every other client, including `context.request` with the profile's cookies (verified 2026-10-28), and its cross-origin redirect blocks an in-page `fetch`.
- Each fresh profile must clear a challenge before it is trusted, and many cookie-less sessions from one IP in a short time get AO3's "Shields are up!" block. Reuse one profile volume when testing against AO3.
- `src/api.ts`: Worker client; validates every response against the shared schemas.

The checker sends raw HTML and never parses AO3 pages: the Worker parses them with the same HTMLRewriter code as its own cron, so extraction stays in one place.

## Worker contract

Schemas live in `@qcksys/ao3tracker-core/work-checker`; the routes are in [apps/api/src/routes/checker.ts](../api/src/routes/checker.ts). Change both sides in the same PR. Every request carries `Authorization: Bearer <WORK_CHECKER_TOKEN>`.

1. `GET /checker/settings` returns the `work_checker` row of the API database's `ao3track__app_setting` table (see [the API guide](../api/AGENTS.md#browser-work-checker) for the SQL). They change without a deployment; the container picks them up on its next poll.
2. `POST /checker/claim` returns jobs: missing tracked works first, then stale works leased for 30 minutes. While `enabled` is false it returns none, and the Worker cron fetches from AO3 itself.
3. `POST /checker/results` takes one outcome per work (`page`, `not_found`, `restricted`, `unavailable`, `failed`). For a `page` with more chapters than stored, the Worker answers `needs_chapter_index`; the checker loads `/navigate` and posts again with both pages. Otherwise it answers `applied` with the backup formats to download.
4. `PUT /checker/backups/:workId/:format?downloadUpdatedAt=<unix>` uploads a download. 409 (`superseded`) means AO3 has a newer revision; the next refresh lists it again.
5. `POST /checker/status` reports the checker's state for the API's admin dashboard, at startup and after every poll: `CHECKER_ID` (one per environment, e.g. `hub-dev`), `CHECKER_VERSION` (the image's source commit, from the `SOURCE_REF` build argument), start time, the last poll's summary (claimed works, outcome counts, backups, whether it stopped early) and the last poll error. A failed report is logged and retried with the next poll.

Missing works are not leased, so run **one** checker per API environment. A poll must finish inside the 30-minute refresh lease: keep `maxWorksPerPoll × (delayBetweenRequestsMs + page load time)` well under it.

## Runtime

- Node runs `src/*.ts` directly with type stripping: use erasable syntax only (no enums, namespaces or parameter properties) and `.ts` extensions on relative imports. The core package resolves through its workspace symlink to `packages/ao3-core/src`; Node refuses to strip types under `node_modules`, so the image installs the workspace layout rather than a `pnpm deploy` copy.
- The image is `linux/amd64` only: Google Chrome has no Linux arm64 build.
- Chrome needs a large `/dev/shm`; [deploy/compose.yaml](deploy/compose.yaml) sets `shm_size: 1gb` and `init: true`.
- The image runs as the base image's `node` user (UID 1000), so host secret files owned by UID 1000 mount readable. `WORK_CHECKER_TOKEN_FILE` takes precedence over `WORK_CHECKER_TOKEN`.
- The Docker healthcheck (`src/health.ts`) passes only while polls keep reaching the Worker, so a wrong token or an API without `/checker` routes reports unhealthy.

## Deployment

CI publishes `ghcr.io/qcksys/ao3tracker-work-checker` from [release-work-checker.yml](../../.github/workflows/release-work-checker.yml) after each successful API deployment: tag `dev` after `Release dev`, tag `main` after `Release main`, each also tagged with its commit SHA. A superseded commit cannot move a branch tag. Each image therefore matches the contract of the API it polls.

The hub (`ssh hub`) runs [deploy/](deploy/) from `~/ao3-work-checker`: one Compose service per environment (`dev` follows tag `dev` against dev.ao3tracker.com, `prod` follows `main` against ao3tracker.com). A user systemd timer runs `node update.ts` (hub's Node 24 strips types; keep it to Node built-ins and erasable syntax) every two minutes, under `flock` so runs never overlap. It resolves each tag to a digest, replaces only that environment's container, and records the digest in `deployment.json` once Compose reports it healthy. An unpublished tag is skipped; a failed rollout leaves `deployment.json` unchanged and the timer retries.

- Tokens: the `env.WORK_CHECKER_TOKEN` field of the 1Password items "ao3tracker-api .dev.vars.dev" (`Work/QckSys`) and "ao3tracker-api .dev.vars.prod" (`Development`), tagged `dev/ao3tracker`. Those items hold each Worker's secrets as one concealed field per variable in an `env` section; add new secrets there as fields rather than as new items. The value is also each Worker's `WORK_CHECKER_TOKEN` secret. The hub keeps copies in `~/ao3-work-checker/secrets/{dev,prod}_token` (mode 600). Rotate by updating 1Password, the Worker secret and the hub file together.
- Host files are copied from a reviewed revision of `deploy/`; only images update automatically. The updater's logic is tested in `test/update.test.ts`.
- Operate with `systemctl --user list-timers ao3-work-checker-update.timer`, `journalctl --user -u ao3-work-checker-update.service`, and `docker compose -p ao3-work-checker logs <dev|prod>`. Pause deployment by stopping the timer. Roll back by setting `<DEV|PROD>_IMAGE` to `previousImage` from `deployment.json` and running `docker compose up -d --wait <service>` with the timer stopped.
- `enabled` in an environment's `work_checker` setting hands its AO3 fetching to its checker; while it is false or unset the checker idles and the Worker cron fetches.
