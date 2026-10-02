# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, etc.) working in this repository. This file covers the monorepo as a whole; **each app under `apps/` has its own `AGENTS.md` with app-specific build, architecture, and convention details — read the relevant one before making changes inside an app.**

`CLAUDE.md` next to each `AGENTS.md` is a symlink to it, so either name works.

## Repository layout

Vite+ (`vp`) manages workspace commands, Node.js, and dependency installation. It uses the pinned pnpm backend and lockfile. Apps retain their own build tools, invoked through `vp run`; the native app uses Gradle.

Node.js is pinned by `engines.node` in the root [package.json](package.json). Vite+ and CI resolve this fallback directly; keep Node overrides out of the workflows and higher-priority project declarations absent.

| Path                                                   | Stack                                                                                                       | Per-app guide                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [apps/api/](apps/api/)                                 | Cloudflare Workers, Hono, Drizzle ORM, PlanetScale MySQL, Better Auth, Vitest                               | [apps/api/AGENTS.md](apps/api/AGENTS.md)                             |
| [apps/browser-extension/](apps/browser-extension/)     | WXT, React 19, Tailwind 4, shadcn/ui (Base UI variant), react-router                                        | [apps/browser-extension/AGENTS.md](apps/browser-extension/AGENTS.md) |
| [apps/native-kmp/](apps/native-kmp/)                   | Kotlin Multiplatform, Compose Multiplatform, Gradle (Android/iOS/JVM); embedded WebView scripts use Vite+   | [apps/native-kmp/AGENTS.md](apps/native-kmp/AGENTS.md)               |
| [packages/ao3-core/](packages/ao3-core/)               | Shared AO3 DOM extraction + zod wire schemas (consumed by browser-extension and native-kmp/webview-scripts) | —                                                                    |
| [packages/ao3-sync-client/](packages/ao3-sync-client/) | Typed sync/auth client for the `/api/track/sync` and Better Auth endpoints                                  | —                                                                    |

Workspace config: [pnpm-workspace.yaml](pnpm-workspace.yaml) (`apps/*`, `apps/native-kmp/webview-scripts`, `packages/*`). Lockfile: [pnpm-lock.yaml](pnpm-lock.yaml). Changesets: [.changeset/](.changeset/).

### Shared packages

Both clients (browser extension and native KMP app) ingest AO3 pages and sync to the same api. To prevent the extraction logic from drifting, it lives in `packages/ao3-core` and is consumed via workspace `:*` deps. Subpath imports matter: prefer `@qcksys/ao3tracker-core/dom`, `@qcksys/ao3tracker-core/badges`, `@qcksys/ao3tracker-core/schemas` over the package root so consumers don't pull `zod` into bundles that don't need it (the native WebView IIFE is a 7 kB bundle today; importing the root would balloon it to ~330 kB).

## When you make a change

1. **Identify which app you're in.** If your edits are inside `apps/<name>/`, follow `apps/<name>/AGENTS.md` — it overrides anything generic. If you're touching tooling shared across apps (workspace files, root scripts, changesets), this file is the guide.
2. **Use the app's own build commands**, not generic ones. Use `vp run` for package scripts: the API builds with Vite+, the extension with WXT, and WebView scripts with Vite's programmatic API. Native KMP builds use Gradle; `vp install` installs only workspace dependencies.
3. **When a change spans apps** (e.g. an API contract change that affects both `apps/api` and a client), update the corresponding AGENTS.md sections so the contract stays documented in both places.

## Branching and automated deployments

- **Branch from `dev` by default.** Fetch `origin/dev` before creating a new feature or fix branch, and start from that updated ref. Use the `tom-alle-codex/` branch prefix unless the user specifies another name or starting point.
- **Target PRs at `dev` by default.** Set the base explicitly (`gh pr create --base dev`) rather than relying on GitHub's default branch. Use `main` for deliberate production promotions, or another target when the user requests it.
- **Production releases require new Changesets tags.** Successful push CI on the current `main` commit runs Changesets: pending changesets update the version PR; consumed changesets allow new package-version tags. Only a newly created and verified tag batch calls `Release main`: check and deploy the production API, then release the production Android package to internal testing and upload a production Chrome draft. Ordinary main merges with no new tags do not deploy.
- **Dev merges deploy and release apps.** Successful push CI on the current `dev` commit runs `Release dev`: check the dev database, deploy and smoke-test the dev API, then release the separate Android Dev app and Chrome Beta extension when their respective inputs changed since a successful automatic release.
- **PR checks do not deploy.** Automatic releases require successful push CI from the same repository and reject superseded commits. Protected deployment jobs apply pending database migrations, then run read-only readiness checks before deploying the API. Migration, readiness, or deployment failures block the dependent store releases.
- **Cancel only before deployment.** Keep API builds cancellable per branch and protect the full API/Android/Chrome release chain once its deployment lock is acquired. Preserve artifact handoff and stale-source retry checks; see [release concurrency](docs/store-releases.md) before changing these boundaries.
- **Releases run inside CI.** After workspace and Android/JVM checks pass, CI calls the reusable workflows from the same commit: `Release dev` on dev pushes, or Changesets followed by `Release main` when new tags are created on main. Built-in-token tag pushes do not trigger separate workflows. Keep cancellation on individual check/build jobs so an active deployment can finish.

Before changing deployment automation, configuring store credentials, or running a manual release, read [store releases](docs/store-releases.md) for environment setup, beta identities, initial store uploads, versioning, and retry behavior.

Native selection runs inside workspace checks. Pushes compare against successful same-branch CI history; stores use their own successful release history. Keep conservative fallbacks for missing history and failed comparisons. See [CI selection and caching](docs/store-releases.md) before changing these rules.

## Root-level commands

These operate across the workspace via Vite+:

```bash
vp install      # Install all workspace dependencies
vp run ready      # fmt + lint + test + build, recursive across apps
vp run -r test    # Run tests in every workspace package
vp run -r build   # Build every workspace package
```

For app-specific commands (running dev servers, deploying, building a single platform), use the app's own AGENTS.md. Run workspace tests through `vp run -r test` so each package selects its runner. See [API testing guidance](apps/api/AGENTS.md#testing) for the Cloudflare Vitest 4 exception before upgrading test dependencies.

## Conventions that apply everywhere

- **Package management**: use `vp install`, `vp add`, `vp remove`, and `vp exec` everywhere, including `apps/native-kmp/webview-scripts/`. Keep the pnpm `packageManager` pin, workspace configuration, and lockfile: Vite+ delegates installation to that backend. The Gradle build invokes `vp install --frozen-lockfile` at the workspace root before `vp run build` in `webview-scripts/`.
- **Formatting**: `vp fmt` is the only formatter for workspace source and documentation. The root `vite.config.ts` sets two-space indentation and LF endings; generated Worker types and database snapshots retain their generator's formatting. API and WebView Biome configurations run lint and import organization with formatting disabled. Run `vp fmt --check`, `vp lint`, and the app's `biome:ci` checks after changes.
- **Don't commit secrets**: `.env`, `.dev.vars`, `local.properties`, `release.keystore` are all gitignored — keep it that way.
- **Local API secrets**: use the API package scripts, which use Varlock and its 1Password plugin to load one Secure Note via the CLI. See [API setup](apps/api/README.md#local-secrets-in-1password) when configuring a checkout or changing secret loading. Builds and tests run without vault access.
- **No root-level `CLAUDE.md` content**: this file (`AGENTS.md`) is the source of truth; `CLAUDE.md` is a symlink to it. Same pattern in each app. Don't reintroduce the Vite+ template stub.

## Changesets

Versioning and changelog generation use [Changesets](https://github.com/changesets/changesets). Config lives in [.changeset/config.json](.changeset/config.json) — `commit: false` (you commit the changeset with your PR), `access: restricted` (no npm auto-publish, all packages are private/internal), `baseBranch: main`.

Successful push CI on `main` creates or updates a version PR against `main` that consumes pending changesets, bumps package versions, and generates package `CHANGELOG.md` files. After that PR is merged and CI passes, Changesets creates missing package-version tags and production releases once for the new tag batch. Changesets stay pending on `dev` until promoted to `main`. Write user-facing summaries in changesets; Android and Chrome workflows use them for patch-note artifacts, and Android uploads shortened notes to Google Play. After merging the version PR into `main`, merge `main` back into `dev` to synchronize versions, changelogs, and consumed changesets. For setup, note selection, and local previews, see [automatic patch notes](docs/store-releases.md#automatic-patch-notes).

### When to write one

Add a changeset for any user-visible change to a tracked package:

- New features
- Bug fixes that users would notice
- Breaking API changes (for `apps/api`)
- Behaviour changes in the browser extension

Skip changesets for: pure refactors with no behaviour change, internal tooling tweaks, README/AGENTS edits, test-only changes.

### Tracked packages

| Package                                | Path                       | Notes                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@qcksys/ao3tracker-api`               | `apps/api`                 | Cloudflare Worker; no auto-publish                                                                                                                                                                                                                                                  |
| `@qcksys/ao3tracker-browser-extension` | `apps/browser-extension`   | WXT build; no auto-publish                                                                                                                                                                                                                                                          |
| `@qcksys/ao3tracker-native-kmp`        | `apps/native-kmp`          | Kotlin/Gradle. The [package.json](apps/native-kmp/package.json) is a Changesets anchor; actual builds use `./gradlew`. Store workflows generate Android versions at build time; Changesets do not change local Gradle or iOS versions. See [release setup](docs/store-releases.md). |
| `@qcksys/ao3tracker-core`              | `packages/ao3-core`        | Internal workspace package; never published. Consumers reference it as `workspace:*`.                                                                                                                                                                                               |
| `@qcksys/ao3tracker-sync-client`       | `packages/ao3-sync-client` | Internal workspace package; never published.                                                                                                                                                                                                                                        |

### How to add one

From the repo root:

```bash
vp exec changeset           # Interactive: pick packages, bump type, summary
vp exec changeset status    # Show which packages have pending changesets
vp run version-packages     # Consume changesets, update versions/lockfile and format changelogs (release time only)
```

`vp exec changeset` writes a markdown file under [.changeset/](.changeset/) with a random slug like `chilly-rats-clap.md`. Commit it with the PR that introduces the change.

### Bump types

- **patch** — bug fixes, internal-only refactors that fix subtle behaviour
- **minor** — new features, additive API surface
- **major** — breaking changes (removed/renamed exports, changed wire formats, removed routes)

For `@qcksys/ao3tracker-api`, treat the `/api/track/sync` request/response shape as the public contract: additive optional fields are minor; removing or renaming fields is major. The KMP app and browser extension are clients, so an api break implies coordinated changesets for those packages in the same PR.

### Changeset file format

```markdown
---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-browser-extension": patch
---

Short imperative summary on one line.

Optional longer body explaining why and any migration notes. Reads as the
release note for these packages.
```

You can also hand-write the file instead of running `vp exec changeset` — just match the format above.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
