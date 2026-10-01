# Store releases

The root GitHub Actions workflows provide:

Every workflow uses the pinned `voidzero-dev/setup-vp` action to install Vite+ from the workspace catalog. Node version inputs are omitted so Vite+ resolves Node.js 24 from the root `package.json` → `engines.node` fallback. Dependency installation runs with `vp install --frozen-lockfile`; package scripts run through `vp run`. Vite+ retains the existing pnpm backend and lockfile. The Gradle WebView build also requires `vp` on PATH and uses the `vpInstall` task.

| Workflow                         | Trigger                                          | Result                                                                                       |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `CI`                             | Pull requests, pushes to `main`/`dev`, or manual | Formatting, lint, workflow validation, JavaScript tests/builds, JVM tests, Android debug APK |
| `Release main`                   | Successful push CI on current `main`             | Production API deployment, then Android and Chrome releases in parallel                      |
| `Deploy production API`          | Called by `Release main`                         | Read-only migration readiness check, then production Worker deployment                       |
| `Release Android to Google Play` | Called by `Release main`, or manual              | Signed AAB and R8 mapping; optionally a Google Play **internal testing** release             |
| `Release Chrome extension`       | Called by `Release main`, or manual              | Chrome ZIP; optionally a Chrome Web Store **draft upload**                                   |

Once these workflows are on `main` and the setup below is complete, merging to `main` runs CI, deploys the production API, then releases Android to internal testers and uploads a Chrome draft. The Chrome draft still needs manual review submission in the store dashboard. Development API deployments, iOS, and Firefox releases remain manual.

Automatic releases check out the exact successful CI commit. Failed CI, pull requests, manual CI runs, and superseded commits do not deploy. Release workflows queue without interrupting an active deployment; manual and automatic uploads share each store's lock. Each automatic child checks current `main` again so a failed-job retry cannot reuse an old release approval. CI may cancel superseded checks; this is not a guarantee to release every intermediate merge.

Manual store workflows are available in [GitHub Actions](https://github.com/qcksys/ao3tracker/actions) once merged. Select a branch or tag whose CI passed and whose required API changes are already deployed. Manual store runs do not deploy the API or require successful CI automatically.

## Automatic versions and retries

Every store job allocates its version after acquiring its store lock, including manual runs, build-only runs, and retries:

- Android `versionCode` is UTC seconds since January 1, 2020; the human-readable name is `YYYY.M.D+HHmmss`.
- Chrome `version` is `1.<versionCode divided by 65536>.<versionCode modulo 65536>`, using integer division. `version_name` uses the same readable timestamp format.

These values increase with the runner clock and exceed the repository's existing Android code `20` and Chrome version `0.0.1`. A one-second allocation delay separates immediate sequential runs; clock rollback across runners and previously uploaded higher versions require manual investigation. The scheme supports Android's version-code limit through July 2086. Verify that neither store already has a version above this scheme before enabling it.

Versions are generated inside each store job so **Re-run failed jobs** receives a fresh version even after a partial upload. Inspect store processing/review state before retrying. A superseded automatic run is rejected; use the latest successful `main` CI run instead. Source package versions are not bumped or committed, so the pipeline creates no version-commit loop. Changesets still manage package release notes and ordinary local builds; iOS versioning remains manual.

## GitHub environments

Configure the following in [repository environments](https://github.com/qcksys/ao3tracker/settings/environments). Put credentials in environment **secrets**, not variables or source files. The release jobs use these exact environment names.

### `api-production`

| Secret                 | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Token scoped to the configured account/zone with Worker deployment and required binding/route permissions |
| `DATABASE_URL`         | Read-only connection to the same production PlanetScale database used by the Worker                       |

The account ID is already recorded in `apps/api/wrangler.json`. Provision the production Worker runtime secrets and configured Cloudflare resources separately; the workflow preserves existing Worker secrets and never uploads its read-only database credential. See [API deployment readiness](../apps/api/AGENTS.md#production-deployment-readiness).

### Database migrations

Deployments require every repository migration to be recorded in `ao3track__migrations` with its UTC timestamp (to the second) and SQL checksum. RC ledgers must also match each migration folder name; legacy ledgers are accepted without changes. The checker accepts LF/CRLF line-ending variants, checks required columns and temporal precision against the latest snapshot, and blocks on missing or mismatched history. It does not prove all indexes, defaults, or data are correct.

Apply reviewed schema changes through PlanetScale before deploying code that requires them. In particular, the pending sync-cursor and Better Auth changes require migrations `20260930095035_sync-mutation-cursors` and `20260930103837_auth-two-factor-lockout` (formerly `0011` and `0012`). For databases created through schema pushes or manual SQL, inspect the live schema and reconcile the ledger only after verifying each change. The pipeline never replays historical migrations or writes the ledger. If this check or API deployment fails, both store releases are blocked.

Drizzle RC migrations use timestamped folders containing SQL and a snapshot. The repository conversion preserves all historical SQL. The first manual `vp run db:migrate` with the RC upgrades the existing ledger with `name` and `applied_at` columns, then applies pending SQL. Review this separately with a credential permitted to change the schema; CI's read-only database credential cannot perform that upgrade.

### `google-play`

| Secret                             | Value                                                               |
| ---------------------------------- | ------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | Base64 encoding of the existing Android upload keystore             |
| `ANDROID_KEYSTORE_PASSWORD`        | Keystore password                                                   |
| `ANDROID_KEY_ALIAS`                | Upload key alias                                                    |
| `ANDROID_KEY_PASSWORD`             | Upload key password                                                 |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Entire Google service-account JSON key; only required for uploading |

### `chrome-web-store`

| Kind     | Name                          | Value                                                                                           |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Variable | `CHROME_EXTENSION_ID`         | `hjonebiohecalkggemeneaaohafldkkl`                                                              |
| Variable | `CHROME_PUBLISHER_ID`         | `c77f78ba-195c-49ce-be7b-cb99ce8dc629` (confirmed in Chrome Web Store **Publisher → Settings**) |
| Secret   | `CHROME_SERVICE_ACCOUNT_JSON` | Entire JSON key for the service account linked to the Chrome publisher                          |

Chrome's `build_only` option works without store variables or credentials. Android's `build_only` option still requires all four signing secrets, because its artifact must be suitable for a manual Play upload.

## 1Password backup

Release credentials are stored in the **QckSys** vault with the exact tag **QckSys/ao3tracker**:

| Item                                             | Contents                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `AO3 Tracker - Android signing`                  | Keystore password, key password, alias, and original `release.keystore` and `keystore.txt` attachments |
| `AO3 Tracker - Google Play service account`      | Original Google Play service-account JSON document                                                     |
| `AO3 Tracker - Chrome Web Store service account` | Original Chrome service-account JSON document                                                          |

The local originals were removed after verifying the stored fields and file contents. Restore an attachment from 1Password only when needed for local signing or credential maintenance. GitHub Actions reads its configured environment secrets directly.

## Google Play setup

The existing [Play Console app](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974343187457150951/app-dashboard) uses package **`com.qcksys.ao3tracker`**. The workflow fixes this package and the `internal` track.

1. Check **App integrity → App signing** and use the upload key already registered for this app, backed up in the 1Password signing item above. Do not generate a replacement for an existing upload key. If the key has been lost, use Play's upload-key reset process. [App signing documentation](https://developer.android.com/studio/publish/app-signing).
2. Enable **Google Play Android Developer API** in a Google Cloud project. Create a service account and JSON key. Invite its email in Play Console **Users and permissions**, grant access to this app and the permissions to view the app and release to testing tracks. Store its JSON in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. [API setup](https://developers.google.com/android-publisher/getting_started).
3. If no AAB has ever been uploaded, run this workflow with `build_only=true`, download its signed AAB artifact, and upload it manually in Play Console. Finish the required app setup and Play App Signing enrollment before using API uploads. Creating the app record alone is insufficient. [Upload action prerequisites](https://github.com/r0adkll/upload-google-play#setup).
4. Configure the internal testing tester list/group and opt-in link in Play Console.

If the keystore secret needs to be restored, download the original attachment to `apps/native-kmp/release.keystore`, then pipe its encoded bytes directly to GitHub from the repository root:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path ./apps/native-kmp/release.keystore))) | gh secret set ANDROID_KEYSTORE_BASE64 --env google-play
```

Set passwords and the alias through the GitHub environment UI. Do not paste credentials into chat or commit them.

### Run an Android release

In Actions, choose **Release Android to Google Play → Run workflow**:

- `status`: `completed` releases to internal testers; `draft` creates a draft on that track for manual completion in Play Console.
- `build_only`: enable to build the signed AAB without contacting Play.

The workflow runs tests, signs the release bundle, verifies its signature, and retains the AAB and R8 mapping for 14 days. Download them from the run's artifacts. Keep a longer-lived copy if needed for release records. Signing files are created only in the runner's temporary directory and removed afterwards; signed builds do not use the Gradle build or configuration caches.

Versions are generated automatically and override Gradle defaults for that run. Local builds retain their configured defaults. The pipeline never promotes a release to Play production.

## Chrome Web Store setup

The existing [Chrome listing](https://chrome.google.com/webstore/devconsole/c77f78ba-195c-49ce-be7b-cb99ce8dc629/hjonebiohecalkggemeneaaohafldkkl/edit) has item ID **`hjonebiohecalkggemeneaaohafldkkl`**.

1. Copy the publisher ID from **Publisher → Settings** into `CHROME_PUBLISHER_ID`, and set `CHROME_EXTENSION_ID` to the item ID above.
2. Enable **Chrome Web Store API** in Google Cloud, create a service account and JSON key, then link that service-account email in the Chrome Developer Dashboard's **Account** settings. Save the JSON in `CHROME_SERVICE_ACCOUNT_JSON`. The workflow uses the v2 API through WXT. [Service-account setup](https://developer.chrome.com/docs/webstore/service-accounts).
3. The listing's **Package → View public key** is recorded in `apps/browser-extension/wxt.config.ts`. It makes unpacked development builds use the same ID as the store listing. [Chrome extension identity documentation](https://developer.chrome.com/docs/extensions/reference/manifest/key).
4. The production API is deployed before automatic store uploads. For manual uploads, deploy required backend changes first: `chrome-extension://hjonebiohecalkggemeneaaohafldkkl` must be present in the deployed API's `ALLOWED_ORIGINS`. Deploy dev separately if using that endpoint. The store helper checks the repository configuration and built manifest identity; it cannot prove which API configuration is live.

The old local development origin remains accepted for existing unpacked installations. Switching an unpacked installation to the store identity changes its extension storage namespace; sign in again and sync before removing the old installation.

### Run a Chrome release

1. Choose **Release Chrome extension → Run workflow** with `build_only=false`. The workflow allocates a new version; no package-version commit is needed.
2. Download the Chrome ZIP artifact if needed; it is retained for 30 days. The upload must pass the manifest-key and API-origin checks before authentication occurs.
3. Review the uploaded draft and complete store listing/privacy fields in the Developer Dashboard. Submit for review there when ready. The workflow never submits, publishes, or cancels an existing review.

For a new listing, use `build_only=true` and manually upload the ZIP through **Add new item** first, then configure its public key, IDs, and API origins. If an upload fails or is still processing, inspect the workflow log and the Package page before retrying; the workflow does not automatically retry store uploads.

## Local validation

From the repository root:

```shell
vp install --frozen-lockfile
vp check
vp run --filter @qcksys/ao3tracker-api biome:ci --error-on-warnings
vp run --filter ao3tracker-webview-scripts biome:ci --error-on-warnings
vp node --test scripts/*.test.mjs
vp run -r test
vp run -r build
```

With Java 21 and Android SDK 36 installed, run `apps/native-kmp/gradlew.bat -p apps/native-kmp :composeApp:jvmTest :composeApp:assembleDebug -x :composeApp:vpInstall --no-configuration-cache` on Windows. On Linux/macOS, use `bash apps/native-kmp/gradlew` in place of the `.bat` command. CI also checks the workflow YAML with checksum-verified actionlint.
