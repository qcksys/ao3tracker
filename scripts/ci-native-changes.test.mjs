import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { needsNativeChecks } from "./ci-native-changes.mjs";

async function repository(t) {
  const cwd = await mkdtemp(join(tmpdir(), "ao3tracker-ci-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "CI test");
  git("config", "user.email", "ci@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", ".no-hooks");
  const commit = () => {
    git("add", ".");
    git("commit", "--quiet", "--allow-empty", "-m", "Test changes");
    return git("rev-parse", "HEAD");
  };
  const write = async (path) => {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), path);
  };
  return { cwd, git, commit, write, base: commit() };
}

const pullRequest = (base, head) => ({
  pull_request: { base: { sha: base }, head: { sha: head } },
});

test("unrelated PR changes skip native checks, including large diffs", async (t) => {
  const repo = await repository(t);
  for (const path of [
    "README.md",
    "apps/native-kmp/AGENTS.md",
    "docs/store-releases.md",
    ".changeset/quiet-build.md",
    "apps/api/src/index.ts",
    "apps/browser-extension/src/main.tsx",
    ...Array.from({ length: 350 }, (_, i) => `apps/api/fixtures/${i}.json`),
  ]) {
    await repo.write(path);
  }
  const head = repo.commit();
  assert.equal(needsNativeChecks("pull_request", pullRequest(repo.base, head), repo.cwd), false);

  await repo.write("apps/native-kmp/composeApp/src/commonMain/kotlin/New.kt");
  assert.equal(
    needsNativeChecks("pull_request", pullRequest(repo.base, repo.commit()), repo.cwd),
    true,
  );
});

test("native sources, shared packages and build configuration require checks", async (t) => {
  const repo = await repository(t);
  for (const path of [
    "apps/native-kmp/composeApp/src/commonMain/kotlin/Example.kt",
    "apps/native-kmp/webview-scripts/src/ao3-tracking.ts",
    "packages/ao3-core/src/dom/index.ts",
    "packages/ao3-sync-client/src/index.ts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "vite.config.ts",
    ".npmrc",
    ".github/workflows/ci.yml",
    "scripts/ci-native-changes.mjs",
    "new-shared-build-input.json",
  ]) {
    const base = repo.git("rev-parse", "HEAD");
    await repo.write(path);
    assert.equal(
      needsNativeChecks("pull_request", pullRequest(base, repo.commit()), repo.cwd),
      true,
      path,
    );
  }
});

test("uses the entire PR diff without including changes made only on its base branch", async (t) => {
  const repo = await repository(t);
  await repo.write("apps/api/src/index.ts");
  const head = repo.commit();
  repo.git("checkout", "--quiet", "--detach", repo.base);
  await repo.write("apps/native-kmp/composeApp/build.gradle.kts");
  const advancedBase = repo.commit();
  assert.equal(needsNativeChecks("pull_request", pullRequest(advancedBase, head), repo.cwd), false);

  await repo.write("docs/follow-up.md");
  assert.equal(
    needsNativeChecks("pull_request", pullRequest(repo.base, repo.commit()), repo.cwd),
    true,
  );
});

test("native deletions and renames out of a native directory still require checks", async (t) => {
  const repo = await repository(t);
  await repo.write("apps/native-kmp/old.kt");
  const base = repo.commit();
  await mkdir(join(repo.cwd, "docs"));
  await rename(join(repo.cwd, "apps/native-kmp/old.kt"), join(repo.cwd, "docs/old.kt"));
  assert.equal(needsNativeChecks("pull_request", pullRequest(base, repo.commit()), repo.cwd), true);

  await repo.write("packages/ao3-core/removed.ts");
  const beforeDelete = repo.commit();
  await rm(join(repo.cwd, "packages/ao3-core/removed.ts"));
  assert.equal(
    needsNativeChecks("pull_request", pullRequest(beforeDelete, repo.commit()), repo.cwd),
    true,
  );
});

test("pushes, manual runs and uncertain comparisons always require checks", async (t) => {
  const repo = await repository(t);
  const unchanged = pullRequest(repo.base, repo.base);
  for (const eventName of ["push", "workflow_dispatch", "unknown"]) {
    assert.equal(needsNativeChecks(eventName, unchanged, repo.cwd), true);
  }
  assert.equal(needsNativeChecks("pull_request", {}, repo.cwd), true);
  assert.equal(needsNativeChecks("pull_request", pullRequest("--help", repo.base), repo.cwd), true);
  assert.equal(
    needsNativeChecks("pull_request", pullRequest("a".repeat(40), repo.base), repo.cwd),
    true,
  );
});

test("CLI writes the decision to the GitHub Actions output file", async (t) => {
  const repo = await repository(t);
  await repo.write("docs/only.md");
  const eventPath = join(repo.cwd, "event.json");
  const outputPath = join(repo.cwd, "output.txt");
  await writeFile(eventPath, JSON.stringify(pullRequest(repo.base, repo.commit())));
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("ci-native-changes.mjs", import.meta.url))],
    {
      cwd: repo.cwd,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
      },
    },
  );
  assert.equal(await readFile(outputPath, "utf8"), "required=false\n");
});
