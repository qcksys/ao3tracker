import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCurrentSource, isCurrentSuccessfulMainRun } from "./release-main.mjs";

const sha = "a".repeat(40);
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
  assert.equal(isCurrentSuccessfulMainRun(event(), sha), true);
  assert.equal(isCurrentSuccessfulMainRun(event(), "b".repeat(40)), false);
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
    assert.equal(isCurrentSuccessfulMainRun(event(overrides), sha), false);
  }
});

test("requires valid commit identity and repository metadata", () => {
  for (const head_sha of [undefined, "main", "a".repeat(39), "z".repeat(40)]) {
    assert.equal(isCurrentSuccessfulMainRun(event({ head_sha }), head_sha), false);
  }
  assert.equal(isCurrentSuccessfulMainRun({}, sha), false);
  assert.equal(isCurrentSuccessfulMainRun({ workflow_run: event().workflow_run }, sha), false);
});

test("failed-job retries cannot reuse approval for an older main commit", () => {
  assert.doesNotThrow(() => assertCurrentSource(sha, sha));
  assert.throws(() => assertCurrentSource(sha, "b".repeat(40)), /latest successful CI/);
  assert.throws(() => assertCurrentSource(undefined, undefined), /latest successful CI/);
  assert.throws(() => assertCurrentSource("main", "main"), /latest successful CI/);
});
