---
"@qcksys/ao3tracker-api": patch
---

Local dev now runs through [portless](https://github.com/vercel-labs/portless): `pnpm dev` serves the API at `https://ao3tracker.localhost` instead of `http://localhost:8787`. Wrangler is pinned to port 8787 via `--app-port`. The cloudflared tunnel (`pnpm proxy`) now forwards `qcksys-ao3tracker-api-local.ta2.dev` to `ao3tracker.localhost` so external traffic also goes through the portless proxy.
