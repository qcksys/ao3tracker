import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

async function workflow(name) {
  return parse(
    await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

test("dev deployment is reachable from push CI without a workflow on the default branch", async () => {
  const ci = await workflow("ci");
  assert.ok(ci.on.push.branches.includes("dev"));
  const release = ci.jobs["release-dev"];
  assert.deepEqual(release.needs, ["workspace", "android"]);
  assert.equal(release.if, "github.event_name == 'push' && github.ref == 'refs/heads/dev'");
  assert.equal(release.uses, "./.github/workflows/deploy-dev-api.yml");
  assert.equal(release.with.source_ref, "${{ github.sha }}");
  assert.equal(release.secrets, "inherit");
  assert.ok((await workflow("deploy-dev-api")).on.workflow_call);
  const preparation = await workflow("prepare-release");
  const checkout = preparation.jobs.ready.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with.ref, "${{ github.event.workflow_run.head_sha || github.sha }}");
  const deployment = (await workflow("release-dev-apps")).jobs.deploy;
  assert.match(deployment.if, /github.event_name == 'push'/);
  assert.match(deployment.if, /github.ref == 'refs\/heads\/dev'/);
  assert.match(deployment.if, /inputs.source_ref == github.sha/);
});

test("new CI runs can cancel checks without cancelling a protected release", async () => {
  const ci = await workflow("ci");
  assert.equal(ci.concurrency, undefined);
  const groups = new Set();
  for (const name of ["workspace", "native"]) {
    const concurrency = ci.jobs[name].concurrency;
    assert.equal(concurrency["cancel-in-progress"], "${{ github.run_attempt == 1 }}");
    assert.match(concurrency.group, /github.event_name/);
    assert.match(concurrency.group, /github.ref/);
    groups.add(concurrency.group);
  }
  assert.equal(groups.size, 2);
  assert.match(ci.jobs.native.concurrency.group, /matrix.target/);
  assert.equal(ci.jobs["release-dev"].concurrency, undefined);
  const release = await workflow("deploy-dev-api");
  assert.equal(release.concurrency, undefined);
  assert.equal(release.jobs.deploy.concurrency["cancel-in-progress"], false);
});
