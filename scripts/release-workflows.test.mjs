import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

async function workflow(name) {
  return parse(
    await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

test("Chrome review deferrals are visible to release history and retain the built ZIP", async () => {
  const { steps } = (await workflow("release-chrome")).jobs.release;
  const upload = steps.find((step) => step.run === "vp node scripts/release-chrome.mjs upload");
  const deferred = steps.find((step) => step.name === "Record deferred Chrome upload");
  assert.equal(deferred.if, `steps.${upload.id}.outputs.deferred == 'true'`);
  assert.match(deferred.run, /not uploaded/);
  assert.ok(steps.indexOf(deferred) > steps.indexOf(upload));
  const artifact = steps.find((step) => step.with?.name?.startsWith("chrome-extension-"));
  assert.ok(steps.indexOf(artifact) < steps.indexOf(upload));
});

test("Changesets creates version PRs or new tags only after successful main CI", async () => {
  const config = await workflow("changesets");
  assert.deepEqual(Object.keys(config.on), ["workflow_call"]);
  assert.equal(config.on.workflow_call.outputs.tagged.value, "${{ jobs.version.outputs.tagged }}");
  assert.equal(config.concurrency.group, "changesets-main");
  assert.equal(config.concurrency["cancel-in-progress"], false);
  const job = config.jobs.version;
  assert.equal(job.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.deepEqual(job.permissions, { contents: "write", "pull-requests": "write" });
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.ref, "${{ github.sha }}");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(checkout.with["fetch-depth"], 0);
  const action = job.steps.find((step) => step.uses?.startsWith("changesets/action@"));
  assert.match(action.uses, /@[a-f0-9]{40}$/);
  assert.equal(action.with["pr-base-branch"], "main");
  assert.equal(action.with["version-script"], "vp run version-packages");
  assert.equal(action.with["publish-script"], "vp exec changeset git-tag");
  assert.equal(action.with["create-github-releases"], false);
  assert.equal(action.with["push-git-tags"], true);
  const guard = job.steps.find((step) => step.run === "vp node scripts/release-main.mjs");
  assert.ok(job.steps.indexOf(guard) < job.steps.indexOf(action));
  assert.equal(action.if, `steps.${guard.id}.outputs.eligible == 'true'`);
  const tags = job.steps.find((step) => step.id === "tags");
  assert.equal(tags.if, `steps.${action.id}.outputs.published == 'true'`);
  assert.equal(tags.env.TAGGED_PACKAGES, `\${{ steps.${action.id}.outputs.published-packages }}`);
  assert.match(tags.run, /gh api.*git\/ref\/tags/);
  assert.match(tags.run, /"\$sha" != "\$GITHUB_SHA"/);
  assert.match(tags.run, /exit 1/);
  assert.match(tags.run, /tagged=true/);
  assert.equal(job.outputs.tagged, "${{ steps.tags.outputs.tagged }}");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["version-packages"], /vp exec changeset version/);
  assert.match(pkg.scripts["version-packages"], /vp install --lockfile-only --ignore-scripts/);
  assert.match(pkg.scripts["version-packages"], /--no-frozen-lockfile && vp fmt$/);
  const changesets = JSON.parse(
    await readFile(new URL("../.changeset/config.json", import.meta.url), "utf8"),
  );
  assert.equal(changesets.baseBranch, "main");
  assert.equal(changesets.format, false);
  assert.deepEqual(changesets.privatePackages, { version: true, tag: true });
  assert.doesNotMatch(JSON.stringify(config), /deploy-api|release-android|release-chrome/);
});

test("production runs once per new Changesets tag batch and requires all CI checks", async () => {
  const ci = await workflow("ci");
  const tags = ci.jobs.changesets;
  assert.deepEqual(tags.needs, ["workspace", "android"]);
  assert.equal(tags.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.deepEqual(tags.permissions, { contents: "write", "pull-requests": "write" });
  assert.equal(tags.uses, "./.github/workflows/changesets.yml");
  const release = ci.jobs["release-main"];
  assert.equal(release.needs, "changesets");
  assert.equal(release.if, "needs.changesets.outputs.tagged == 'true'");
  assert.equal(release.uses, "./.github/workflows/release-main.yml");
  assert.equal(release.with.source_ref, "${{ github.sha }}");
  assert.equal(release.secrets, "inherit");
  assert.deepEqual(Object.keys((await workflow("release-main")).on), ["workflow_call"]);
});

test("both store channels and build-only runs save notes from the exact release source", async () => {
  for (const [store, directory] of [
    ["android", "native-kmp"],
    ["chrome", "browser-extension"],
  ]) {
    const { steps } = (await workflow(`release-${store}`)).jobs.release;
    const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout.with.ref, "${{ inputs.source_ref || github.sha }}");
    const install = steps.find((step) => step.run === "vp install --frozen-lockfile");
    const generate = steps.find((step) => step.run?.includes("scripts/release-notes.mjs"));
    assert.ok(steps.indexOf(generate) > steps.indexOf(install));
    assert.equal(generate.if, undefined);
    assert.doesNotMatch(generate.run, /changeset status|changeset version/);
    assert.ok(generate.run.includes(`apps/${directory}`));
    const artifact = steps.find((step) => step.with?.name?.startsWith(`${store}-notes-`));
    assert.ok(steps.indexOf(artifact) > steps.indexOf(generate));
    assert.equal(artifact.if, undefined);
    assert.equal(artifact.with["if-no-files-found"], "error");
    if (store === "android") {
      const upload = steps.find((step) => step.uses?.startsWith("r0adkll/upload-google-play@"));
      assert.equal(
        upload.with.whatsNewDirectory,
        "${{ runner.temp }}/android-release-notes/whatsnew",
      );
      assert.ok(steps.indexOf(upload) > steps.indexOf(generate));
    }
  }
});

for (const [branch, entry, protectedWorkflow, releaseGroup] of [
  ["main", "release-main", "release-main-apps", "release-main"],
  ["dev", "deploy-dev-api", "release-dev-apps", "api-development"],
]) {
  test(`${branch}: superseded preparation can be canceled without canceling an active release`, async () => {
    const config = await workflow(entry);
    assert.equal(config.concurrency, undefined);
    assert.ok(config.on.workflow_call);
    assert.equal(config.on.workflow_run, undefined);
    assert.equal(config.on.workflow_call.inputs.source_ref.required, true);
    const { prepare, deploy } = config.jobs;
    assert.equal(prepare.concurrency, undefined);
    assert.equal(prepare.uses, "./.github/workflows/prepare-release.yml");
    assert.equal(prepare.with.branch, branch);
    assert.match(prepare.if, /github.event_name == 'push'/);
    assert.ok(prepare.if.includes(`github.ref == 'refs/heads/${branch}'`));
    assert.match(prepare.if, /inputs.source_ref == github.sha/);
    assert.equal(deploy.needs, "prepare");
    assert.equal(deploy.if, "needs.prepare.outputs.eligible == 'true'");
    assert.deepEqual(deploy.concurrency, {
      group: releaseGroup,
      "cancel-in-progress": false,
    });
    assert.equal(deploy.uses, `./.github/workflows/${protectedWorkflow}.yml`);
    assert.equal(deploy.with.source_ref, "${{ needs.prepare.outputs.source_ref }}");
    assert.equal(deploy.with.api_artifact_id, "${{ needs.prepare.outputs.api_artifact_id }}");
  });

  test(`${branch}: the protected release includes the API and both dependent stores`, async () => {
    const config = await workflow(protectedWorkflow);
    assert.ok(config.on.workflow_call);
    assert.equal(config.on.workflow_run, undefined);
    assert.equal(config.concurrency, undefined);
    const apiJob = branch === "main" ? "api" : "deploy";
    for (const store of ["android", "chrome"]) {
      const job = config.jobs[store];
      assert.equal(job.needs, apiJob);
      assert.equal(job.uses, `./.github/workflows/release-${store}.yml`);
      assert.equal(job.with.channel ?? "production", branch === "main" ? "production" : "beta");
      assert.equal(job.concurrency, undefined);
      assert.doesNotMatch(job.if ?? "", /always\(|cancelled\(/);
    }
    if (branch === "main") {
      assert.equal(config.jobs.api.uses, "./.github/workflows/deploy-api.yml");
      assert.equal(config.jobs.api.with.api_artifact_id, "${{ inputs.api_artifact_id }}");
    }
  });
}

test("preparation builds without deployment credentials and exports an immutable API artifact", async () => {
  const config = await workflow("prepare-release");
  const { ready, build } = config.jobs;
  const text = JSON.stringify(config);
  assert.equal(ready.concurrency, undefined);
  assert.ok(ready.steps.some((step) => step.run === "vp node scripts/release-main.mjs"));
  assert.equal(build.needs, "ready");
  assert.equal(build.if, "needs.ready.outputs.eligible == 'true'");
  assert.deepEqual(build.concurrency, {
    group: "release-build-${{ inputs.branch }}",
    "cancel-in-progress": "${{ github.run_attempt == 1 }}",
  });
  assert.equal(
    config.on.workflow_call.outputs.eligible.value,
    "${{ jobs.ready.outputs.eligible }}",
  );
  assert.equal(
    config.on.workflow_call.outputs.source_ref.value,
    "${{ jobs.ready.outputs.source_ref }}",
  );
  const checkout = build.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.ref, "${{ needs.ready.outputs.source_ref }}");
  const retryGuard = build.steps.find((step) => step.run?.includes("assert-current-source"));
  assert.equal(retryGuard.if, "github.run_attempt > 1");
  assert.equal(retryGuard.env.RELEASE_SOURCE_REF, checkout.with.ref);
  assert.equal(build.environment, undefined);
  assert.doesNotMatch(
    text,
    /secrets\.|wrangler deploy|deploy:prod|deploy:dev|release-android|release-chrome|scripts\/migrate\.mjs|db:migrate/,
  );
  const buildStep = build.steps.find((step) => step.run?.includes(" build --mode"));
  assert.ok(buildStep);
  assert.ok(build.steps.indexOf(retryGuard) < build.steps.indexOf(buildStep));
  assert.equal(buildStep.if, undefined);
  assert.equal(buildStep.env.API_BUILD_MODE, "${{ inputs.branch == 'dev' && 'dev' || 'prod' }}");
  assert.equal(buildStep.env.CHROME_BETA_EXTENSION_ID, "${{ vars.CHROME_BETA_EXTENSION_ID }}");
  const upload = build.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.ok(build.steps.indexOf(upload) > build.steps.indexOf(buildStep));
  assert.equal(upload.if, buildStep.if);
  assert.equal(upload.with.path, "apps/api/dist/");
  assert.equal(upload.with["include-hidden-files"], true);
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.match(upload.with.name, /github.run_id/);
  assert.match(upload.with.name, /github.run_attempt/);
  assert.equal(build.outputs.api_artifact_id, `\${{ steps.${upload.id}.outputs.artifact-id }}`);
  assert.equal(
    config.on.workflow_call.outputs.api_artifact_id.value,
    "${{ jobs.build.outputs.api_artifact_id }}",
  );
});

for (const [name, environment, database, token, url] of [
  [
    "deploy-api",
    "api-production",
    "DATABASE_URL",
    "${{ secrets.CLOUDFLARE_API_TOKEN }}",
    "https://ao3tracker.com/ping",
  ],
  [
    "release-dev-apps",
    "api-development",
    "DEV_DATABASE_URL",
    "${{ secrets.DEV_CLOUDFLARE_API_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
    "https://dev.ao3tracker.com/ping",
  ],
]) {
  test(`${environment}: migrate the target database before readiness and artifact deployment`, async () => {
    const config = await workflow(name);
    const { deploy } = config.jobs;
    assert.equal(deploy.environment, environment);
    const { steps } = deploy;
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    assert.equal(download.with["artifact-ids"], "${{ inputs.api_artifact_id }}");
    assert.equal(download.with.path, "apps/api/dist/");
    assert.equal(download.with["run-id"], undefined);
    const migrations = steps.find((step) => step.run?.includes("apps/api/scripts/migrate.mjs"));
    assert.ok(migrations, "deployment must apply pending migrations");
    assert.equal(migrations.env.DATABASE_URL, `\${{ secrets.${database} }}`);
    const readiness = steps.find((step) => step.run?.includes("scripts/check-api-migrations.mjs"));
    assert.equal(readiness.env.DATABASE_URL, migrations.env.DATABASE_URL);
    const guards = steps.filter((step) => step.run?.includes("assert-current-source"));
    assert.equal(
      guards.length,
      2,
      "reject stale sources before migrations and again before deploy",
    );
    const [beforeMigrations, current] = guards;
    assert.equal(beforeMigrations.env.RELEASE_SOURCE_REF, current.env.RELEASE_SOURCE_REF);
    const upload = steps.find((step) => step.run?.includes("wrangler deploy"));
    assert.equal(upload.env.CLOUDFLARE_API_TOKEN, token);
    assert.ok(steps.indexOf(download) < steps.indexOf(upload));
    assert.ok(steps.indexOf(download) < steps.indexOf(beforeMigrations));
    assert.equal(steps.indexOf(beforeMigrations) + 1, steps.indexOf(migrations));
    assert.equal(steps.indexOf(migrations) + 1, steps.indexOf(readiness));
    assert.ok(steps.indexOf(readiness) < steps.indexOf(current));
    for (const step of [beforeMigrations, migrations, readiness, current, upload]) {
      assert.equal(step["continue-on-error"], undefined);
      assert.equal(
        step.if,
        environment === "api-development" ? "steps.release.outputs.eligible == 'true'" : undefined,
      );
    }
    assert.equal(steps.indexOf(current) + 1, steps.indexOf(upload));
    assert.match(upload.run, /wrangler deploy --config dist\/ssr\/wrangler.json/);
    assert.doesNotMatch(JSON.stringify(steps), /deploy:prod|deploy:dev| build --mode/);
    assert.ok(steps.slice(steps.indexOf(upload) + 1).some((step) => step.run?.includes(url)));
  });
}

test("store builds finish on the first attempt and reject stale sources only on retries", async () => {
  for (const store of ["android", "chrome"]) {
    const config = await workflow(`release-${store}`);
    assert.equal(config.concurrency["cancel-in-progress"], false);
    assert.equal(config.concurrency.queue, "max");
    const { steps } = config.jobs.release;
    const retryGuard = steps.find((step) => step.run?.includes("assert-current-source"));
    assert.equal(
      retryGuard.if,
      "(github.event_name == 'workflow_run' || github.event_name == 'push') && github.run_attempt > 1",
    );
    const version = steps.find((step) => step.run?.includes("scripts/release-version.mjs"));
    assert.ok(steps.indexOf(retryGuard) < steps.indexOf(version));
  }
});

test("automatic Android releases reuse CI tests for the same source commit", async () => {
  for (const name of ["release-main-apps", "release-dev-apps"]) {
    const { android } = (await workflow(name)).jobs;
    assert.equal(android.with.ci_verified, true);
    assert.equal(
      android.with.source_ref,
      name === "release-main-apps"
        ? "${{ inputs.source_ref }}"
        : "${{ needs.deploy.outputs.source_ref }}",
    );
  }
  const config = await workflow("release-android");
  assert.equal(config.on.workflow_call.inputs.ci_verified.type, "boolean");
  assert.equal(config.on.workflow_call.inputs.ci_verified.default, false);
  assert.equal(config.on.workflow_dispatch.inputs.ci_verified, undefined);
  const { steps } = config.jobs.release;
  const sharedTests = steps.find((step) => step.run?.includes("ao3tracker-core test"));
  const nativeTests = steps.find((step) => step.run?.includes(":composeApp:jvmTest"));
  for (const step of [sharedTests, nativeTests]) {
    assert.equal(step.if, "${{ !inputs.ci_verified }}");
  }
  assert.match(sharedTests.run, /ao3tracker-webview-scripts test/);
});

test("Android releases restore CI task outputs without publishing signed build caches", async () => {
  const ci = (await workflow("ci")).jobs.native;
  assert.equal(ci.strategy.matrix, "${{ fromJSON(needs.workspace.outputs.native_matrix) }}");
  const ciCache = ci.steps.find((step) => step.uses?.startsWith("actions/cache/restore@"));
  const { steps } = (await workflow("release-android")).jobs.release;
  const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  const cache = steps.find((step) => step.uses?.startsWith("actions/cache/restore@"));
  assert.ok(cache, "release must restore Gradle outputs from native CI");
  assert.equal(cache.with.path, ciCache.with.path);
  assert.equal(
    cache.with.key,
    ciCache.with.key
      .replace("${{ matrix.target }}", "checks")
      .replace("${{ github.sha }}", checkout.with.ref),
  );
  assert.equal(
    cache.with["restore-keys"].split("\n")[0],
    ciCache.with["restore-keys"].replace("${{ matrix.target }}", "checks").trim(),
  );
  assert.notEqual(cache.with["fail-on-cache-miss"], true);
  assert.ok(!steps.some((step) => /^actions\/cache(?:@|\/save@)/.test(step.uses ?? "")));
  for (const setup of steps.filter((step) =>
    step.uses?.startsWith("gradle/actions/setup-gradle@"),
  )) {
    assert.equal(setup.with["cache-provider"], "external");
  }
  const bundle = steps.find((step) => step.name === "Build signed release bundle");
  assert.ok(steps.indexOf(cache) < steps.indexOf(bundle));
  assert.match(bundle.run, /--build-cache/);
  assert.doesNotMatch(bundle.run, /--no-build-cache/);
  assert.match(bundle.run, /--no-configuration-cache/);
  assert.match(bundle.run, /--no-daemon/);
  assert.match(bundle.run, /jarsigner -verify/);
  assert.equal(
    bundle.env.ANDROID_VERSION_CODE,
    "${{ steps.version.outputs.android_version_code }}",
  );
});
