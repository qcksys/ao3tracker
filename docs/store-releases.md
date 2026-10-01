# Store releases

The root GitHub Actions workflows provide:

Every workflow uses the pinned `voidzero-dev/setup-vp` action to install Vite+ from the workspace catalog. Node version inputs are omitted so Vite+ resolves Node.js 24 from the root `package.json` → `engines.node` fallback. Dependency installation runs with `vp install --frozen-lockfile`; package scripts run through `vp run`. Vite+ retains the existing pnpm backend and lockfile. The Gradle WebView build also requires `vp` on PATH and uses the `vpInstall` task.

| Workflow                         | Trigger                                           | Result                                                                                                |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CI`                             | Pull requests, pushes to `main`/`dev`, or manual  | Formatting, lint, workflow validation, JavaScript tests/builds, JVM tests, Android debug and Dev APKs |
| `Release main`                   | Successful push CI on current `main`              | Production API deployment, then Android and Chrome releases in parallel                               |
| `Deploy production API`          | Called by `Release main`                          | Read-only migration readiness check, then production Worker deployment                                |
| `Release dev`                    | Called after CI checks pass on a `dev` push       | Dev API deployment and health check, then separate Android Dev and Chrome Beta releases               |
| `Release Android to Google Play` | Called by `Release main`/`Release dev`, or manual | Signed AAB and R8 mapping; optionally a Google Play **internal testing** release                      |
| `Release Chrome extension`       | Called by `Release main`/`Release dev`, or manual | Chrome ZIP; production draft upload or beta submission for review                                     |

Once the setup below is complete, merging these workflows to `dev` runs its CI checks, then calls `Release dev` within that CI run: build and deploy `https://dev.ao3tracker.com`, release the separate Android Dev app to internal testers, and submit the separate Chrome Beta item for review. Production uses `Release main` after successful push CI on `main`: deploy the production API, release Android to internal testers, and upload a Chrome draft. Production Chrome drafts still require manual review submission. iOS and Firefox releases remain manual.

The development workflow uses `workflow_call`; CI calls the copy from the same tested commit after the workspace and Android/JVM gates succeed. It does not need to exist on the default branch first. The call accepts only `push` events on `refs/heads/dev` with the exact tested SHA. Release preparation validates the push's repository and current dev commit, then deployment checks that source again. Production's `workflow_run` trigger still requires `Release main` to exist on GitHub's default branch (`main`).

Automatic releases check out the exact successful CI commit. Failed CI, pull requests, manual CI runs, and superseded commits do not deploy. CI cancellation is scoped to individual check jobs by event and ref (and matrix target for native builds); there is no workflow-level cancellation that could interrupt a protected release. New first-attempt runs cancel superseded checks, while retries queue. Each release then has two phases, using separate concurrency groups per branch:

- **Prepare and build:** source eligibility is checked before joining the build concurrency group. A new eligible release run cancels an earlier API build. Retries queue without canceling an active build and recheck the source before building, even when GitHub reuses the earlier eligibility job's outputs. The build saves an immutable API artifact, without deployment credentials. Canceled or failed preparation cannot proceed to deployment.
- **Deploy and release:** after preparation succeeds, a non-canceling lock covers API deployment, its health check, and both Android and Chrome builds/uploads. A newer run can replace a pending release, but cannot interrupt one that has acquired this lock. The API job checks the source branch again immediately before deployment, so an obsolete pending artifact cannot deploy. Store jobs on the first attempt finish even if the branch advances after API deployment starts.

The deployment phase downloads the API artifact by ID from the same workflow run and deploys it without rebuilding. Failed-job retries reuse that artifact; a full rerun produces a new artifact with a distinct attempt number. Each automatic store retry checks its source branch (`main` or `dev`) again so it cannot reuse an old release approval. Manual and automatic uploads still share a non-canceling lock per store and channel, and allocate versions only after acquiring it. Manual store runs retain their existing serialization. This is not a guarantee to release every intermediate merge.

CI runs JVM tests and the Android Debug build in one job, alongside a separate minified Android Dev build. The `Android and JVM checks` status requires both jobs to succeed. PRs skip native builds only when their entire diff contains API, browser-extension, Markdown, `docs/`, or `.changeset/` changes. Native sources, shared packages, lockfiles, root configuration, CI scripts, and unknown paths require native checks. Failed comparisons run the checks. Pushes to `main`/`dev` and manual runs always run the full native checks so release candidates are validated even if an earlier CI run failed or was cancelled.

Each native job restores its most recent Gradle cache and successful non-PR runs save a snapshot keyed by commit. Gradle validates cached task inputs; build-file changes can reuse dependencies and unaffected task outputs. PRs read caches without writing them. These caches contain only Gradle User Home `caches/` and `wrapper/`, and the signed release workflow remains separate. Download the `native-build-profile-checks` and `native-build-profile-dev` artifacts for Gradle task timings when comparing cold and warm builds.

Manual store workflows are available in [GitHub Actions](https://github.com/qcksys/ao3tracker/actions) once merged. Select a branch or tag whose CI passed and whose required API changes are already deployed. Manual store runs do not deploy the API or require successful CI automatically.

## Automatic versions and retries

Every store job allocates its version after acquiring its store lock, including manual runs, build-only runs, and retries:

- Android `versionCode` is UTC seconds since January 1, 2020; the human-readable name is `YYYY.M.D+HHmmss`.
- Chrome `version` is `1.<versionCode divided by 65536>.<versionCode modulo 65536>`, using integer division. `version_name` uses the same readable timestamp format.

These values increase with the runner clock and exceed the repository's existing Android code `20` and Chrome version `0.0.1`. A one-second allocation delay separates immediate sequential runs; clock rollback across runners and previously uploaded higher versions require manual investigation. The scheme supports Android's version-code limit through July 2086. Verify that neither store already has a version above this scheme before enabling it.

Versions are generated inside each store job so **Re-run failed jobs** receives a fresh version even after a partial upload. Inspect store processing/review state before retrying. A superseded automatic run is rejected; use the latest successful `main` CI run instead. Source package versions are not bumped or committed, so the pipeline creates no version-commit loop. Changesets still manage package release notes and ordinary local builds; iOS versioning remains manual.

## GitHub environments

Configure the following in [repository settings](https://github.com/qcksys/ao3tracker/settings/secrets/actions). Put credentials in **secrets**, not variables or source files. If this private repository uses GitHub Free, use repository secrets; environment secrets require a supported plan. The release jobs retain the environment names below for deployment history. Set beta ID/key variables at repository scope so both API and store jobs can read them.

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

### `api-development`

| Secret                     | Value                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| `DEV_DATABASE_URL`         | Read-only connection to the development Worker's PlanetScale database          |
| `DEV_CLOUDFLARE_API_TOKEN` | Optional token scoped to development Worker deployment and its bindings/domain |
| `CLOUDFLARE_API_TOKEN`     | Existing deployment token, used when `DEV_CLOUDFLARE_API_TOKEN` is absent      |

Set these as repository secrets, or in the `api-development` environment if the repository's GitHub plan supports environment secrets. The dev database check uses only `DEV_DATABASE_URL`; it never falls back to the production `DATABASE_URL`. The selected Cloudflare token must be able to deploy `ao3tracker-api-dev` and its configured resources.

Provision the dev Worker's runtime secrets, R2 bucket, queues, and email sender separately. Apply reviewed schema changes to the dev database and reconcile its migration ledger before deployment. The same read-only readiness check used for production blocks deployment on mismatches; it does not migrate the database. Release preparation builds with the `dev` Wrangler environment; the protected release deploys that artifact, then checks `https://dev.ao3tracker.com/ping`.

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

The existing [Play Console app](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974343187457150951/app-dashboard) uses package **`com.qcksys.ao3tracker`**. The production channel uses this package; beta uses **`com.qcksys.ao3tracker.dev`**. Both use the `internal` track.

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
- `channel`: `production` uses the existing app; `beta` uses AO3 Tracker Dev and defaults to the dev API.
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
3. For `channel=production`, review the uploaded draft and complete store listing/privacy fields in the Developer Dashboard, then submit for review manually. For `channel=beta`, the workflow submits for review automatically after upload. Neither channel cancels an existing review.

For a new listing, use `build_only=true` and manually upload the ZIP through **Add new item** first, then configure its public key, IDs, and API origins. If an upload fails or is still processing, inspect the workflow log and the Package page before retrying; the workflow does not automatically retry store uploads.

## Beta and dev store releases

Both store workflows accept `channel=beta` for manual builds and uploads. `Release dev` selects it automatically after deploying and checking the dev API. A failed dev database check or deployment blocks both beta releases. Missing store setup fails the relevant store job without affecting the API deployment.

### Android Dev bootstrap

1. The separate [AO3 Tracker Dev Play Console app](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974701134454351254/app-dashboard) uses package **`com.qcksys.ao3tracker.dev`** and is free. Configure its internal testing list. It installs alongside production, with separate local app data. See [Play testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334).
2. The Firebase Android app is registered in `qs-ao3tracker`; its public client config is in `composeApp/src/dev/google-services.json`. The `dev` build type inherits release signing/minification and uses the dev API for a fresh install. An explicit saved environment choice still takes precedence. See [Android build variants](https://developer.android.com/build/build-variants) and [Firebase variant configuration](https://firebase.google.com/docs/android/google-services-plugin-and-file).
3. Reuse the existing upload keystore and Play service account. Give that service account access to the new app and permission to release to testing tracks. Existing production app permissions alone may not cover the new app.
4. Run **Release Android to Google Play** with `channel=beta`, `build_only=true`. Upload the signed `composeApp-dev.aab` to the new app's internal track once and complete Play App Signing and required app declarations. A local unsigned `bundleDev` is useful for validation but cannot bootstrap Play publishing.
5. After the initial release/setup, automatic dev releases upload to that app's `internal` track. Beta version names append `-dev`; the production package, track, and defaults remain unchanged.

### Chrome Beta bootstrap

1. Run **Release Chrome extension** with `channel=beta`, `build_only=true`, or locally run `vp run --filter @qcksys/ao3tracker-browser-extension zip -b chrome --mode beta`. Upload its `*-chrome-beta.zip` through **Add new item** in the Developer Dashboard. The first ZIP may omit the manifest key so Chrome can assign a separate identity.
2. Name the listing **AO3 Tracker Beta** and describe it as a development/testing build using the dev API. Link to the [production listing](https://chromewebstore.google.com/detail/hjonebiohecalkggemeneaaohafldkkl), as required by [Chrome's test-variant guidance](https://developer.chrome.com/docs/webstore/spam-faq/). Use **Unlisted** distribution for testers with the link, or **Private** for selected testers; both require review. Complete listing, screenshots, privacy, and permission declarations before automatic submission. See [distribution settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
3. Set repository variables **`CHROME_BETA_EXTENSION_ID`** to the new item ID and **`CHROME_BETA_PUBLIC_KEY`** to its **Package → View public key** value. Neither is a secret. Keep the existing production ID/key and publisher credentials. The helper refuses to upload a beta to the production item or an item whose public key does not match.
4. Deploy dev with `CHROME_BETA_EXTENSION_ID` set. The Vite plugin appends only that exact extension origin to the dev Worker's `ALLOWED_ORIGINS`; production builds ignore it. Local deployments must provide the variable too, or they will remove the beta origin from the built configuration.
5. Automatic beta uploads verify the live dev API preflight response, then submit for review. They do not cancel an existing review or skip review. Inspect pending review/upload state before retrying a failed submission. Approved updates distribute according to the item's store settings.

Beta mode permits only AO3 and `https://dev.ao3tracker.com`, defaults auth/sync to dev, and saves a distinct `chrome-mv3-beta` directory and ZIP. It does not use the production public key as a fallback. Testers must install the beta listing separately.

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

With Java 21 and Android SDK 36 installed, run `apps/native-kmp/gradlew.bat -p apps/native-kmp :composeApp:jvmTest :composeApp:assembleDebug :composeApp:bundleDev -x :composeApp:vpInstall --no-configuration-cache` on Windows. On Linux/macOS, use `bash apps/native-kmp/gradlew` in place of the `.bat` command. CI also builds the minified Dev APK and checks workflow YAML with checksum-verified actionlint.
