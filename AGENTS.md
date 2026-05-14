# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in this repository. This file covers the monorepo as a whole; **each app under `apps/` has its own `AGENTS.md` with app-specific build, architecture, and convention details — read the relevant one before making changes inside an app.**

`CLAUDE.md` next to each `AGENTS.md` is a symlink to it, so either name works.

## Repository layout

This is a pnpm monorepo. Top-level tooling is Vite+ (the `vp` CLI), but most apps use their own toolchain — the root scripts are mainly for cross-cutting tasks like `pnpm install` and changesets.

| Path | Stack | Per-app guide |
|---|---|---|
| [apps/api/](apps/api/) | Cloudflare Workers, Hono, Drizzle ORM, PlanetScale MySQL, Better Auth, Vitest | [apps/api/AGENTS.md](apps/api/AGENTS.md) |
| [apps/browser-extension/](apps/browser-extension/) | WXT, React 19, Tailwind 4, react-router | [apps/browser-extension/AGENTS.md](apps/browser-extension/AGENTS.md) |
| [apps/native-kmp/](apps/native-kmp/) | Kotlin Multiplatform, Compose Multiplatform, Gradle (Android/iOS/JVM), bun+vitest for embedded WebView scripts | [apps/native-kmp/AGENTS.md](apps/native-kmp/AGENTS.md) |

Workspace config: [pnpm-workspace.yaml](pnpm-workspace.yaml) (`apps/*`). Lockfile: [pnpm-lock.yaml](pnpm-lock.yaml). Changesets: [.changeset/](.changeset/).

## When you make a change

1. **Identify which app you're in.** If your edits are inside `apps/<name>/`, follow `apps/<name>/AGENTS.md` — it overrides anything generic. If you're touching tooling shared across apps (workspace files, root scripts, changesets), this file is the guide.
2. **Use the app's own build commands**, not generic ones. The api uses pnpm; the browser-extension uses pnpm + wxt; native-kmp uses Gradle, with a nested bun toolchain inside `webview-scripts/`. Don't run `pnpm install` at the root expecting it to drive Gradle.
3. **When a change spans apps** (e.g. an API contract change that affects both `apps/api` and a client), update the corresponding AGENTS.md sections so the contract stays documented in both places.

## Root-level commands

These operate across the workspace via Vite+:

```bash
pnpm install      # Install all workspace dependencies
vp run ready      # fmt + lint + test + build, recursive across apps
vp run test -r    # Run tests in every workspace package
vp run build -r   # Build every workspace package
```

For app-specific commands (running dev servers, deploying, building a single platform), use the app's own AGENTS.md.

## Conventions that apply everywhere

- **Package manager**: pnpm. Don't introduce `npm`/`yarn` lockfiles. Native-kmp's `webview-scripts/` is the only exception — it uses bun, which is intentional (the Gradle build invokes `bun run`).
- **Don't commit secrets**: `.env`, `.dev.vars`, `local.properties`, `release.keystore` are all gitignored — keep it that way.
- **Changesets** ([.changeset/](.changeset/)) are used for versioning. Run `pnpm changeset` to add one when shipping a user-visible change.
- **No root-level `CLAUDE.md` content**: this file (`AGENTS.md`) is the source of truth; `CLAUDE.md` is a symlink to it. Same pattern in each app. Don't reintroduce the Vite+ template stub.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.

<!--VITE PLUS END-->
