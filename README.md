# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Store releases

GitHub Actions checks the workspace and Android app on pull requests and pushes to `main` or `dev`. Successful `main` push CI deploys the production API, then releases a signed Android bundle to Google Play internal testing and uploads a Chrome Web Store draft, with generated versions. API deployment requires verified database migration history. See [release setup](docs/store-releases.md) for credentials, migrations, first uploads, and manual retries.

## Development

Use Vite+ (`vp`) for dependency installation and workspace tasks. Run `vp install --frozen-lockfile` after checkout. The pnpm workspace files and lockfile remain because Vite+ manages pnpm as its installation backend. CI uses the official `voidzero-dev/setup-vp` action.

The root [package.json](package.json) pins Node.js 24 through `engines.node`. Vite+ and CI use this [documented fallback](https://viteplus.dev/guide/env#node-js-selection) directly.

- Check everything is ready:

```bash
vp run ready
```

- Run the workspace JavaScript/TypeScript tests:

```bash
vp run test -r
```

- Run the full pre-push test hook:

```bash
git hook run pre-push
```

The pre-push hook runs the workspace tests, JVM tests, Android Debug unit tests, and Android Debug instrumented tests. It requires JDK 21, the Android SDK, and a running test emulator or connected test device. Any failure, including a missing device, blocks the push. `vp install` installs the hook dispatcher.

- Build the monorepo:

```bash
vp run build -r
```

- Run the development server:

Configure the API's [1Password local secrets](apps/api/README.md#local-secrets-in-1password) first. The browser extension and native app do not need API secrets for local builds.

```bash
vp run dev
```

## License

Original code and documentation in this repository are licensed under the [MIT License](LICENSE).

Third-party materials retain their own licenses. The [AO3 stylesheet fixtures](apps/native-kmp/composeApp/src/androidInstrumentedTest/assets/ao3-skins/README.md) are licensed under [GPLv2](apps/native-kmp/composeApp/src/androidInstrumentedTest/assets/ao3-skins/LICENSE.txt); their upstream license and attribution are included alongside the fixtures.
