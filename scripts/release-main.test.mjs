import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCurrentSource, isCurrentDevPush, isCurrentSuccessfulRun } from "./release-main.mjs";

const sha = "a".repeat(40);
test("dev CI push eligibility requires the current same-repository dev commit", () => {
  const push = { ref: "refs/heads/dev", after: sha, repository: { id: 123 }, deleted: false };
  assert.equal(isCurrentDevPush(push, sha, 123), true);
  assert.equal(isCurrentDevPush(push, "b".repeat(40), 123), false);
  assert.equal(isCurrentDevPush(push, sha, 456), false);
  assert.equal(isCurrentDevPush(push, sha, NaN), false);
  for (const override of [
    { ref: "refs/heads/main" },
    { ref: "refs/pull/11/merge" },
    { deleted: true },
    { repository: undefined },
    { after: "dev" },
    { after: undefined },
  ]) {
    assert.equal(isCurrentDevPush({ ...push, ...override }, sha, 123), false);
  }
  assert.equal(isCurrentDevPush(event(), sha, 123), false);
});

function event(overrides = {}) {
  return {
    repository: { id: 123 },
    workflow_run: {
      name: "CI",
      conclusion: "success",
      event: "push",
      head_branch: "main",
      head_repository: { id: 123 },
      head_sha: sha,
      ...overrides,
    },
  };
}

test("releases only the current successful main push", () => {
  assert.equal(isCurrentSuccessfulRun(event(), sha), true);
  assert.equal(isCurrentSuccessfulRun(event(), "b".repeat(40)), false);
});

test("rejects CI failures, untrusted runs, and manual CI", () => {
  for (const overrides of [
    { name: "Other workflow" },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { conclusion: null },
    { event: "pull_request" },
    { event: "workflow_dispatch" },
    { head_branch: "dev" },
    { head_repository: { id: 456 } },
    { head_repository: null },
  ]) {
    assert.equal(isCurrentSuccessfulRun(event(overrides), sha), false);
  }
});

test("requires valid commit identity and repository metadata", () => {
  for (const head_sha of [undefined, "main", "a".repeat(39), "z".repeat(40)]) {
    assert.equal(isCurrentSuccessfulRun(event({ head_sha }), head_sha), false);
  }
  assert.equal(isCurrentSuccessfulRun({}, sha), false);
  assert.equal(isCurrentSuccessfulRun({ workflow_run: event().workflow_run }, sha), false);
});

test("failed-job retries cannot reuse approval for an older main commit", () => {
  assert.doesNotThrow(() => assertCurrentSource(sha, sha));
  assert.throws(() => assertCurrentSource(sha, "b".repeat(40)), /latest successful CI/);
  assert.throws(() => assertCurrentSource(undefined, undefined), /latest successful CI/);
  assert.throws(() => assertCurrentSource("main", "main"), /latest successful CI/);
});

test("dev deploys only the current successful same-repository dev push", () => {
  const devEvent = event({ head_branch: "dev" });
  assert.equal(isCurrentSuccessfulRun(devEvent, sha, "dev"), true);
  assert.equal(isCurrentSuccessfulRun(devEvent, "b".repeat(40), "dev"), false);
  assert.equal(isCurrentSuccessfulRun(event(), sha, "dev"), false);
  assert.equal(isCurrentSuccessfulRun(devEvent, sha), false);
  for (const overrides of [
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { event: "pull_request" },
    { event: "workflow_dispatch" },
    { head_repository: { id: 456 } },
    { head_sha: "dev" },
  ]) {
    assert.equal(
      isCurrentSuccessfulRun(event({ head_branch: "dev", ...overrides }), sha, "dev"),
      false,
    );
  }
});

test("dev retries reject superseded commits and unsupported release branches", () => {
  assert.doesNotThrow(() => assertCurrentSource(sha, sha, "dev"));
  assert.throws(() => assertCurrentSource(sha, "b".repeat(40), "dev"), /current dev/);
  assert.throws(() => assertCurrentSource("dev", "dev", "dev"), /current dev/);
  assert.throws(() => assertCurrentSource(sha, sha, "feature"), /latest successful CI/);
  assert.equal(isCurrentSuccessfulRun(event({ head_branch: "feature" }), sha, "feature"), false);
});
