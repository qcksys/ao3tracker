# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Store releases

GitHub Actions checks the workspace and Android app on pull requests and pushes to `main` or `dev`. Successful `main` push CI deploys the production API, then releases a signed Android bundle to Google Play internal testing and uploads a Chrome Web Store draft, with generated versions. API deployment requires verified database migration history. See [release setup](docs/store-releases.md) for credentials, migrations, first uploads, and manual retries.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run test -r
```

- Build the monorepo:

```bash
vp run build -r
```

- Run the development server:

```bash
vp run dev
```
