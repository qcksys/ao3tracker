# Store releases

The root GitHub Actions workflows provide:

Every workflow uses the pinned `voidzero-dev/setup-vp` action to install Vite+ from the workspace catalog. Node version inputs are omitted so Vite+ resolves Node.js 24 from the root `package.json` → `engines.node` fallback. Dependency installation runs with `vp install --frozen-lockfile`; package scripts run through `vp run`. Vite+ retains the existing pnpm backend and lockfile. The Gradle WebView build also requires `vp` on PATH and uses the `vpInstall` task.

| Workflow                                | Trigger                                           | Result                                                                                                |
| --------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CI`                                    | Pull requests, pushes to `main`/`dev`, or manual  | Formatting, lint, workflow validation, JavaScript tests/builds, JVM tests, Android debug and Dev APKs |
| `Generate patch notes and release tags` | Called after CI checks pass on a `main` push      | Update the version PR, or create missing Changesets package-version tags                              |
| `Release main`                          | Successful current `main` push CI and Changesets  | Production API deployment, then Android Internal; new tags also select Android Alpha and Chrome       |
| `Deploy production API`                 | Called by `Release main`                          | Pending migrations, database readiness check, then production Worker deployment                       |
| `Release dev`                           | Called after CI checks pass on a `dev` push       | Dev API deployment and health check, then changed Android Dev and Chrome Beta releases                |
| `Release Android to Google Play`        | Called by `Release main`/`Release dev`, or manual | Signed AAB and R8 mapping; optionally a Google Play Internal and/or Alpha release                     |
| `Release Chrome extension`              | Called by `Release main`/`Release dev`, or manual | Chrome ZIP; production draft upload or beta submission for review                                     |

Once the setup below is complete, merging these workflows to `dev` runs its CI checks, then calls `Release dev` within that CI run: build and deploy `https://dev.ao3tracker.com`, release the separate Android Dev app to internal testers when native inputs changed, and submit the separate Chrome Beta item for review when extension inputs changed. Every eligible `main` push calls `Release main` after successful CI and Changesets: deploy the production API and release the production Android app to Internal, even when native inputs are unchanged. When Changesets creates and verifies new tags in that run, the same signed Android build is uploaded once to both Internal and Alpha, and changed Chrome inputs produce a production draft. Production Chrome drafts still require manual review submission. iOS and Firefox releases remain manual.

Both release workflows use `workflow_call`; CI calls the copy from the same tested commit after the workspace and Android/JVM gates succeed. The calls accept only push events on their source branch with the exact tested SHA. Release preparation validates the push's repository and current branch commit, then deployment checks that source again. Alpha and production Chrome additionally require Changesets to report new tags and verify each remote tag points to the tested commit. One tag batch selects these destinations once, even when several packages are tagged. Dev stores and production Chrome build only when their inputs changed since a successful automatic release; production Android builds on every eligible main push. CI forwards the verified tag result through reusable workflow inputs because tag pushes made with the built-in GitHub token do not trigger another workflow. Manually pushed tags do not start this release chain.

Automatic releases check out the exact successful CI commit. Failed CI, pull requests, manual CI runs, and superseded commits do not deploy. CI cancellation is scoped to individual check jobs by event and ref (and matrix target for native builds); there is no workflow-level cancellation that could interrupt a protected release. New first-attempt runs cancel superseded checks, while retries queue. Each release then has two phases, using separate concurrency groups per branch:

- **Prepare and build:** source eligibility is checked before joining the build concurrency group. A new eligible release run cancels an earlier API build. Retries queue without canceling an active build and recheck the source before building, even when GitHub reuses the earlier eligibility job's outputs. The build saves an immutable API artifact, without deployment credentials. Canceled or failed preparation cannot proceed to deployment.
- **Deploy and release:** after preparation succeeds, a non-canceling lock covers database migrations, API deployment, its health check, and both Android and Chrome builds/uploads. A newer run can replace a pending release, but cannot interrupt one that has acquired this lock. The API job checks the source branch before migrations and again immediately before deployment, so an obsolete pending release cannot migrate or deploy. Store jobs on the first attempt finish even if the branch advances after API deployment starts.

The deployment phase downloads the API artifact by ID from the same workflow run and deploys it without rebuilding. Failed-job retries reuse that artifact; a full rerun produces a new artifact with a distinct attempt number. Each automatic store retry checks its source branch (`main` or `dev`) again so it cannot reuse an old release approval. Manual and automatic uploads still share a non-canceling lock per store and channel, and allocate versions only after acquiring it. Manual store runs retain their existing serialization. This is not a guarantee to release every intermediate merge.

Workspace checks also select native work, avoiding a separate detection runner. Relevant PRs run JVM, shared Android host and debug application tests plus Android Debug. Gradle, dependency, manifest, ProGuard and unknown root build changes also run dev/release application tests and the minified Dev APK; add the `ci:android-minify` PR label to request these explicitly. Manual CI runs both native targets. Push CI runs the ordinary native checks when needed; store builds test their application variant and validate minification through the signed AAB without a preceding Dev APK build. Shrinker failures on ordinary source changes can therefore surface at release time. The required `Android and JVM checks` status still fails when a required native job fails or is cancelled.

PR selection compares the complete merge-base diff. Push selection compares the current tree with the most recent successful ancestral push CI commit on the same branch, not the preceding push, so failed and cancelled intermediate commits remain covered. API-only, extension-only and documentation changes skip native work; shared packages, lockfiles and unknown inputs run it. Missing history, API errors and failed comparisons conservatively run checks.

Inside the protected deployment job, dev Android and Chrome compare against their own most recent successful automatic store job from successful same-branch CI history. Production Android runs regardless of its change comparison; production Chrome uses its comparison only when new tags were verified. Skipped jobs and deferred Chrome uploads never advance a store baseline, and manual/build-only runs are not used as baselines. Chrome jobs with a successful `Record deferred Chrome upload` step retain the previous upload baseline, so later dev pushes still select the unreleased changes. The lookup checks up to 1,000 successful CI runs, including paginated job lists; absent history rebuilds the affected store. This also conservatively rebuilds a store that succeeded in an otherwise failed CI run. API deployment, migrations and health checks still run before any selected stores. Automatic beta releases remain per relevant dev push; superseded validation can be cancelled, but an active protected release still finishes.

Each native job restores its most recent Gradle cache and successful non-PR runs save a snapshot keyed by commit. Gradle validates cached task inputs; build-file changes can reuse dependencies and unaffected task outputs. PRs read caches without writing them. These caches contain only Gradle User Home `caches/` and `wrapper/`. Android releases restore the JVM/Debug cache for their source commit, falling back to the most recent checks snapshot and then older Dev snapshots. Gradle reuses matching task outputs and rebuilds tasks affected by release versioning, signing, or the production variant. Validation sets `APP_BUILD_TIME_UTC=2020-01-01 00:00:00 UTC`, making generated Kotlin build metadata stable across checks and cache restores. Signed releases and local builds leave it unset and retain the actual build time. Release versioning and signing still require affected tasks to rebuild. Release jobs never upload their Gradle caches. Download the `native-build-profile-checks` and `native-build-profile-dev` artifacts for Gradle task timings when comparing cold and warm builds.

Manual store workflows are available in [GitHub Actions](https://github.com/qcksys/ao3tracker/actions) once merged. Select a branch or tag whose CI passed and whose required API changes are already deployed. Manual store runs do not deploy the API or require successful CI automatically.

## Automatic versions and retries

Every store job allocates its version after acquiring its store lock, including manual runs, build-only runs, and retries:

- Android `versionCode` is UTC seconds since January 1, 2020; the human-readable name is `YYYY.M.D+HHmmss`.
- Chrome `version` is `1.<versionCode divided by 65536>.<versionCode modulo 65536>`, using integer division. `version_name` uses the same readable timestamp format.

These values increase with the runner clock and exceed the repository's existing Android code `20` and Chrome version `0.0.1`. A one-second allocation delay separates immediate sequential runs; clock rollback across runners and previously uploaded higher versions require manual investigation. The scheme supports Android's version-code limit through July 2086. Verify that neither store already has a version above this scheme before enabling it.

Versions are generated inside each store job so **Re-run failed jobs** receives a fresh version even after a partial upload. Inspect store processing/review state before retrying. A superseded automatic run is rejected; release current `main` for Internal, and use a verified new tag batch or a manual store release for Alpha/production Chrome. Store jobs do not commit source package versions. Changesets records package versions and changelogs through a separate version PR; store version allocation stays independent. iOS versioning remains manual.

For a failed main release, use **Re-run failed jobs** on its CI run. It retains the successful Changesets job's output and retries the failed release jobs under the existing source checks, including Alpha/Chrome selection when that run created tags. **Re-run all jobs** runs Changesets again; already-existing tags produce no new-tag output, so it redeploys the API and releases Android to Internal but skips Alpha and Chrome. To retry those destinations after a full rerun, use the manual store workflows with the intended track and current tested source. If tags were only partially created or verification failed, inspect the remote tags before retrying; existing tags are not moved automatically.

## Automatic patch notes

Write release summaries in `.changeset/*.md` with each user-visible change. **Generate patch notes and release tags** is called after successful push CI on current `main` and maintains one version PR against `main`. Changesets stay pending on `dev` until promoted to `main`. The version PR runs `vp run version-packages` to consume changesets, bump the private package versions, generate per-package `CHANGELOG.md` files, and update the lockfile. Review and merge that PR on `main`, then merge `main` back into `dev` to synchronize versions, changelogs, and consumed changesets.

Once there are no pending changesets, the action runs `vp exec changeset git-tag`, with private-package tagging enabled. It creates missing `package-name@version` tags and pushes them through the GitHub API. New tags verified against the tested commit add Alpha to Android's Internal upload and enable the production Chrome release; unchanged package versions with existing tags still deploy the API and release Android to Internal. The first tagging run includes any existing package versions that have never been tagged. This command publishes neither npm packages nor GitHub Releases.

Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, as required by the [Changesets action](https://github.com/changesets/action). The workflow uses the built-in GitHub token. Approve the version PR's workflow runs when GitHub requests approval after a bot update. Merging it as a user triggers `main` CI; after checks pass, new Changesets tags select Android Alpha and production Chrome alongside the main push's API/Internal release. See [GitHub token event behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Both store workflows generate notes from their exact checked-out source, including manual, beta, production, build-only and retry runs:

- If that package has a pending Changesets release, use its changeset summaries for the upcoming package version. Notes accumulate until the version PR is merged.
- Otherwise, use the `CHANGELOG.md` entry matching the checked-in package version. Rebuilds reuse those notes. These are package-version notes, not a diff since the previous store upload.
- If neither exists, state that no user-facing changes were recorded. Dependency-only releases use a dependency-update note.

Full Markdown notes appear in the workflow summary and separate `android-notes-*` / `chrome-notes-*` artifacts. Android also uploads `whatsnew-en-US` through the existing Play action. This plain-text copy uses each change's opening paragraph and is limited to [500 Unicode characters](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en), with an ellipsis when truncated; the artifact retains the full text. Put a concise user-facing summary first in each changeset and technical details in later paragraphs. Chrome notes are available in the artifact for store-listing edits.

Preview the native notes without changing versions or consuming changesets:

```shell
vp node scripts/release-notes.mjs apps/native-kmp dist/release-notes
```

Use `apps/browser-extension` as the package directory to preview Chrome notes. `vp run version-packages` is the mutating command used by the version PR; do not run it just to preview notes. Changesets' built-in formatter is disabled so this command formats generated changelogs through `vp fmt`, using the repository's Vite+ configuration.

## GitHub environments

Configure the following in [repository settings](https://github.com/qcksys/ao3tracker/settings/secrets/actions). Put credentials in **secrets**, not variables or source files. If this private repository uses GitHub Free, use repository secrets; environment secrets require a supported plan. The release jobs retain the environment names below for deployment history. Set beta ID/key variables at repository scope so both API and store jobs can read them.

### `api-production`

| Secret                 | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Token scoped to the configured account/zone with Worker deployment and required binding/route permissions |
| `DATABASE_URL`         | Connection with migration permissions to the same production PlanetScale database used by the Worker      |

The account ID is already recorded in `apps/api/wrangler.json`. Provision the production Worker runtime secrets and configured Cloudflare resources separately; the workflow preserves existing Worker secrets and never uploads its migration database credential. See [API deployment readiness](../apps/api/AGENTS.md#production-deployment-readiness).

### Database migrations

The protected deployment job runs `vp node apps/api/scripts/migrate.mjs` using its existing database secret before deploying the Worker. Drizzle applies pending SQL from the checked-out source commit and records it in `ao3track__migrations`. Database credentials need DDL and write permissions. Release preparation and PR checks do not run migrations.

After migration, the read-only readiness checker requires every repository migration to be recorded with its UTC timestamp (to the second), SQL checksum, and RC migration folder name. The checker accepts LF/CRLF line-ending variants, checks required columns and temporal precision against the latest snapshot, and blocks on missing or mismatched history. It does not prove all indexes, defaults, or data are correct. Migration, readiness, or API deployment failures block both store releases.

Drizzle RC migrations use timestamped folders containing SQL and a snapshot. The repository conversion preserves all historical SQL. The first migration run upgrades a legacy ledger with `name` and `applied_at` columns, then applies pending SQL. Review migration SQL before merging and keep it compatible with the currently deployed Worker, since migrations run first. DDL is not transactionally rolled back; inspect partial failures before retrying. For databases changed through schema pushes or manual SQL, reconcile the ledger only after verifying which changes are already applied. CI does not baseline history or suppress mismatches.

### `api-development`

| Secret                     | Value                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| `DEV_DATABASE_URL`         | Connection with migration permissions to the dev Worker's PlanetScale database |
| `DEV_CLOUDFLARE_API_TOKEN` | Optional token scoped to development Worker deployment and its bindings/domain |
| `CLOUDFLARE_API_TOKEN`     | Existing deployment token, used when `DEV_CLOUDFLARE_API_TOKEN` is absent      |

Set these as repository secrets, or in the `api-development` environment if the repository's GitHub plan supports environment secrets. Dev migrations and readiness checks use only `DEV_DATABASE_URL`; they never fall back to the production `DATABASE_URL`. The selected Cloudflare token must be able to deploy `ao3tracker-api-dev` and its configured resources.

Provision the dev Worker's runtime secrets, R2 bucket, queues, and email sender separately. Release preparation builds with the `dev` Wrangler environment; the protected release applies pending migrations, runs the same readiness check as production, deploys that artifact, then checks `https://dev.ao3tracker.com/ping`.

### `google-play`

| Secret                             | Value                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`          | Base64 encoding of the existing Android upload keystore                                                        |
| `ANDROID_KEYSTORE_PASSWORD`        | Keystore password                                                                                              |
| `ANDROID_KEY_ALIAS`                | Upload key alias                                                                                               |
| `ANDROID_KEY_PASSWORD`             | Upload key password                                                                                            |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Entire Google service-account JSON key; only required for uploading                                            |
| `POSTHOG_CLI_API_KEY`              | Personal API key scoped to AO3 Tracker dev/production projects with error tracking write and organization read |

Android builds embed a PostHog mapping ID. Release builds upload the matching R8 mapping through the PostHog Gradle plugin before the store upload; a failed mapping upload fails the release. The workflow selects EU project 291114 for beta and 69100 for production, and requires the key even for signed build-only runs. Local and PR builds without this key still generate mapping IDs but skip uploads. The official CLI is a workspace dev dependency; Linux release jobs run Gradle through `vp exec` to put it on PATH. PostHog Gradle plugin 1.7.0 incorrectly passes `cmd /c` to the CLI on Windows, so use Linux for authenticated Gradle release builds. Back up the key in the QckSys vault item **AO3 Tracker - PostHog release symbols**, tagged **QckSys/ao3tracker**. This personal key is only for symbol uploads; the API proxy uses its separate Worker project token.

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

The existing [Play Console app](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974343187457150951/app-dashboard) uses package **`com.qcksys.ao3tracker`**. The production channel uses this package: main pushes target `internal`, and verified Changesets tag batches target `internal,alpha`. Beta uses **`com.qcksys.ao3tracker.dev`** on `internal` only. The production channel names the app configuration, not Google Play's public Production track.

1. Check **App integrity → App signing** and use the upload key already registered for this app, backed up in the 1Password signing item above. Do not generate a replacement for an existing upload key. If the key has been lost, use Play's upload-key reset process. [App signing documentation](https://developer.android.com/studio/publish/app-signing).
2. Enable **Google Play Android Developer API** in a Google Cloud project. Create a service account and JSON key. Invite its email in Play Console **Users and permissions**, grant access to this app and the permissions to view the app and release to testing tracks. Store its JSON in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. [API setup](https://developers.google.com/android-publisher/getting_started).
3. If no AAB has ever been uploaded, run this workflow with `build_only=true`, download its signed AAB artifact, and upload it manually in Play Console. Finish the required app setup and Play App Signing enrollment before using API uploads. Creating the app record alone is insufficient. [Upload action prerequisites](https://github.com/r0adkll/upload-google-play#setup).
4. Configure the Internal tester list/group for each app and the Closed testing → Alpha list for the production app. Keep the qualifying closed-test cohort enrolled in Alpha; Internal opt-ins for the same package are excluded from Closed testing. [Testing track rules](https://support.google.com/googleplay/android-developer/answer/9845334).

If the keystore secret needs to be restored, download the original attachment to `apps/native-kmp/release.keystore`, then pipe its encoded bytes directly to GitHub from the repository root:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path ./apps/native-kmp/release.keystore))) | gh secret set ANDROID_KEYSTORE_BASE64 --env google-play
```

Set passwords and the alias through the GitHub environment UI. Do not paste credentials into chat or commit them.

### Run an Android release

In Actions, choose **Release Android to Google Play → Run workflow**:

- `status`: `completed` submits the release to the selected testing tracks; `draft` leaves it for manual completion in Play Console. Availability still depends on Play's required declarations and review.
- `channel`: `production` uses the existing app; `beta` uses AO3 Tracker Dev and defaults to the dev API.
- `tracks`: `internal` (default), `alpha`, or `internal,alpha`. Alpha is restricted to the production app. Selecting both uploads one signed version to both tracks in the same Play edit; an edit failure fails the release rather than reporting either track as published.
- `build_only`: enable to build the signed AAB without contacting Play.

Automatic Android releases pass `ci_verified: true` for the exact source commit that passed workspace and native CI, so the release job skips the repeated shared extraction, WebView, and JVM tests. Manual releases and reusable calls without that flag run all three test suites. The workflow signs the release bundle, verifies its signature, and retains the AAB and R8 mapping for 14 days. Download them from the run's artifacts. Keep a longer-lived copy if needed for release records. Signing files are created only in the runner's temporary directory and removed afterwards. Signed builds reuse CI task outputs with the Gradle build cache enabled, while the configuration cache and daemon remain disabled; no Gradle cache is saved after signing.

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

For a new listing, use `build_only=true` and manually upload the ZIP through **Add new item** first, then configure its public key, IDs, and API origins. If Chrome rejects an upload in either channel with `FAILED_PRECONDITION` / `NOT_UPDATEABLE` because the item is already in review, the job reports a deferred upload and keeps the ZIP artifact without failing CI. It does not cancel the existing review or count the new build as uploaded. After review completes, run this workflow on the latest `dev` commit with `channel=beta` or latest `main` commit with `channel=production`. The next dev push or tagged production release also retries, respectively; an ordinary main push does not trigger a production Chrome upload. There is no scheduled retry. All other upload errors still fail; inspect the workflow log and the Package page before retrying.

## Beta and dev store releases

Both store workflows accept `channel=beta` for manual builds and uploads. `Release dev` selects it automatically after deploying and checking the dev API. A failed dev database check or deployment blocks both beta releases. Missing store setup fails the relevant store job without affecting the API deployment.

### Android Dev bootstrap

1. The separate [AO3 Tracker Dev Play Console app](https://play.google.com/console/u/0/developers/8397971245515484939/app/4974701134454351254/app-dashboard) uses package **`com.qcksys.ao3tracker.dev`** and is free. Configure its internal testing list. It installs alongside production, with separate local app data. See [Play testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334).
2. The Firebase Android app is registered in `qs-ao3tracker`; its public client config is in `androidApp/src/dev/google-services.json`. The `dev` build type inherits release signing/minification and uses the dev API for a fresh install. An explicit saved environment choice still takes precedence. See [Android build variants](https://developer.android.com/build/build-variants) and [Firebase variant configuration](https://firebase.google.com/docs/android/google-services-plugin-and-file).
3. Reuse the existing upload keystore and Play service account. Give that service account access to the new app and permission to release to testing tracks. Existing production app permissions alone may not cover the new app.
4. Run **Release Android to Google Play** with `channel=beta`, `build_only=true`. Upload the signed `androidApp-dev.aab` to the new app's internal track once and complete Play App Signing and required app declarations. A local unsigned `bundleDev` is useful for validation but cannot bootstrap Play publishing.
5. After the initial release/setup, automatic dev releases upload to that app's `internal` track. Beta version names append `-dev`; its package and tester enrollment are separate from the production app's Internal and Alpha tracks.

### Chrome Beta bootstrap

1. Run **Release Chrome extension** with `channel=beta`, `build_only=true`, or locally run `vp run --filter @qcksys/ao3tracker-browser-extension zip -b chrome --mode beta`. Upload its `*-chrome-beta.zip` through **Add new item** in the Developer Dashboard. The first ZIP may omit the manifest key so Chrome can assign a separate identity.
2. Name the listing **AO3 Tracker Beta** and describe it as a development/testing build using the dev API. Link to the [production listing](https://chromewebstore.google.com/detail/hjonebiohecalkggemeneaaohafldkkl), as required by [Chrome's test-variant guidance](https://developer.chrome.com/docs/webstore/spam-faq/). Use **Unlisted** distribution for testers with the link, or **Private** for selected testers; both require review. Complete listing, screenshots, privacy, and permission declarations before automatic submission. See [distribution settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
3. Set repository variables **`CHROME_BETA_EXTENSION_ID`** to the new item ID and **`CHROME_BETA_PUBLIC_KEY`** to its **Package → View public key** value. Neither is a secret. Keep the existing production ID/key and publisher credentials. The helper refuses to upload a beta to the production item or an item whose public key does not match.
4. Deploy dev with `CHROME_BETA_EXTENSION_ID` set. The Vite plugin appends only that exact extension origin to the dev Worker's `ALLOWED_ORIGINS`; production builds ignore it. Local deployments must provide the variable too, or they will remove the beta origin from the built configuration.
5. Automatic beta uploads verify the live dev API preflight response, then submit for review. They defer when Chrome rejects an upload because a submission is already in review, retaining the ZIP and previous upload baseline. They do not cancel an existing review or skip review. Inspect pending review/upload state before retrying a failed submission. Approved updates distribute according to the item's store settings.

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

With Java 21 and Android SDK 37.0 installed, run `apps/native-kmp/gradlew.bat -p apps/native-kmp :composeApp:jvmTest :androidApp:assembleDebug :androidApp:bundleDev -x :composeApp:vpInstall --no-configuration-cache` on Windows. On Linux/macOS, use `bash apps/native-kmp/gradlew` in place of the `.bat` command. CI builds the minified Dev APK for build-tool PR changes, the `ci:android-minify` label and manual runs; push releases exercise minification through the signed AAB. CI checks workflow YAML with checksum-verified actionlint.
