import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

async function workflow(name) {
  return parse(
    await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

for (const [branch, entry, protectedWorkflow, releaseGroup] of [
  ["main", "release-main", "release-main-apps", "release-main"],
  ["dev", "deploy-dev-api", "release-dev-apps", "api-development"],
]) {
  test(`${branch}: superseded preparation can be canceled without canceling an active release`, async () => {
    const config = await workflow(entry);
    assert.equal(config.concurrency, undefined);
    assert.deepEqual(config.on.workflow_run.branches, [branch]);
    const { prepare, deploy } = config.jobs;
    assert.equal(prepare.concurrency, undefined);
    assert.equal(prepare.uses, "./.github/workflows/prepare-release.yml");
    assert.equal(prepare.with.branch, branch);
    assert.match(prepare.if, /conclusion == 'success'/);
    assert.match(prepare.if, /event == 'push'/);
    assert.ok(prepare.if.includes(`head_branch == '${branch}'`));
    assert.match(prepare.if, /head_repository.id == github.repository_id/);
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
    /secrets\.|wrangler deploy|deploy:prod|deploy:dev|release-android|release-chrome/,
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
  test(`${environment}: deploy the prepared artifact only after database and current-source checks`, async () => {
    const config = await workflow(name);
    const { deploy } = config.jobs;
    assert.equal(deploy.environment, environment);
    const { steps } = deploy;
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    assert.equal(download.with["artifact-ids"], "${{ inputs.api_artifact_id }}");
    assert.equal(download.with.path, "apps/api/dist/");
    assert.equal(download.with["run-id"], undefined);
    const readiness = steps.find((step) => step.run?.includes("scripts/check-api-migrations.mjs"));
    assert.equal(readiness.env.DATABASE_URL, `\${{ secrets.${database} }}`);
    const current = steps.find((step) => step.run?.includes("assert-current-source"));
    const upload = steps.find((step) => step.run?.includes("wrangler deploy"));
    assert.equal(upload.env.CLOUDFLARE_API_TOKEN, token);
    assert.ok(steps.indexOf(download) < steps.indexOf(upload));
    assert.ok(steps.indexOf(readiness) < steps.indexOf(current));
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
    assert.equal(retryGuard.if, "github.event_name == 'workflow_run' && github.run_attempt > 1");
    const version = steps.find((step) => step.run?.includes("scripts/release-version.mjs"));
    assert.ok(steps.indexOf(retryGuard) < steps.indexOf(version));
  }
});
