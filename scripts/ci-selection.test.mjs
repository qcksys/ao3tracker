import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  affectsChrome,
  affectsNative,
  findBaselines,
  nativePlan,
  storePlan,
} from "./ci-native-changes.mjs";

async function repository(t) {
  const cwd = await mkdtemp(join(tmpdir(), "ao3tracker-selection-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "CI test");
  git("config", "user.email", "ci@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", ".no-hooks");
  async function commit(path = "README.md") {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), path);
    git("add", ".");
    git("commit", "--quiet", "--allow-empty", "-m", "Test");
    return git("rev-parse", "HEAD");
  }
  return { cwd, git, commit, base: await commit() };
}

const pr = (base, head, labels = []) => ({
  pull_request: { base: { sha: base }, head: { sha: head }, labels },
});
const run = (id, sha, extra = {}) => ({
  id,
  head_sha: sha,
  event: "push",
  head_branch: "dev",
  conclusion: "success",
  ...extra,
});
const job = (store, conclusion = "success", branch = "dev") => ({
  name: `release-${branch} / deploy / ${store} / ${store === "android" ? "Build and release Android" : "release"}`,
  conclusion,
});

test("ordinary native PRs keep tests and Debug; risky changes and opt-in add minification", async (t) => {
  const repo = await repository(t);
  const head = await repo.commit("apps/native-kmp/composeApp/src/commonMain/kotlin/Reader.kt");
  const ordinary = nativePlan("pull_request", pr(repo.base, head), undefined, repo.cwd);
  assert.equal(ordinary.required, true);
  assert.deepEqual(
    ordinary.matrix.include.map((entry) => entry.target),
    ["checks"],
  );
  assert.match(ordinary.matrix.include[0].tasks, /jvmTest.*assembleDebug/);
  for (const task of [
    ":composeApp:testAndroidHostTest",
    ":androidApp:testDebugUnitTest",
    ":androidApp:assembleDebug",
  ])
    assert.ok(ordinary.matrix.include[0].tasks.split(" ").includes(task));
  const forced = nativePlan(
    "pull_request",
    pr(head, head, [{ name: "ci:android-minify" }]),
    undefined,
    repo.cwd,
  );
  assert.equal(forced.required, true);
  assert.equal(forced.matrix.include.length, 2);
  assert.doesNotMatch(ordinary.matrix.include[0].tasks, /(?:Dev|Release)UnitTest|assembleDev/);
  assert.equal(
    forced.matrix.include[1].tasks,
    ":androidApp:testDevUnitTest :androidApp:testReleaseUnitTest :androidApp:assembleDev",
  );
  for (const path of [
    "pnpm-lock.yaml",
    "apps/native-kmp/gradle/libs.versions.toml",
    "apps/native-kmp/composeApp/build.gradle.kts",
    "apps/native-kmp/androidApp/build.gradle.kts",
    "apps/native-kmp/androidApp/proguard-rules.pro",
    "apps/native-kmp/androidApp/src/main/AndroidManifest.xml",
  ]) {
    const next = await repo.commit(path);
    assert.equal(
      nativePlan("pull_request", pr(head, next), undefined, repo.cwd).matrix.include.length,
      2,
      path,
    );
  }
  assert.equal(nativePlan("workflow_dispatch", {}, undefined, repo.cwd).matrix.include.length, 2);
});

test("push comparisons include changes from failed or cancelled intermediate commits", async (t) => {
  const repo = await repository(t);
  const failed = await repo.commit("apps/native-kmp/composeApp/src/commonMain/kotlin/Reader.kt");
  const head = await repo.commit("docs/follow-up.md");
  const plan = nativePlan("push", { before: failed, after: head }, repo.base, repo.cwd);
  assert.equal(plan.required, true);
  assert.deepEqual(
    plan.matrix.include.map((entry) => entry.target),
    ["checks"],
  );
  assert.equal(nativePlan("push", { after: head }, failed, repo.cwd).required, false);
  assert.equal(nativePlan("push", { after: head }, undefined, repo.cwd).required, true);
});

test("history excludes current runs, PRs, other branches, failures and non-ancestors", async (t) => {
  const repo = await repository(t);
  const head = await repo.commit("apps/api/index.ts");
  repo.git("checkout", "--quiet", "--detach", repo.base);
  const other = await repo.commit("apps/native-kmp/other.kt");
  const baselines = await findBaselines({
    branch: "dev",
    head,
    runId: 10,
    cwd: repo.cwd,
    request: async (path) => {
      assert.match(path, /event=push&status=success/);
      return {
        workflow_runs: [
          run(10, head),
          run(9, head, { event: "pull_request" }),
          run(8, head, { head_branch: "main" }),
          run(7, head, { conclusion: "cancelled" }),
          run(6, head, { conclusion: "failure" }),
          run(5, other),
          run(4, repo.base),
        ],
      };
    },
  });
  assert.deepEqual(baselines, { native: repo.base });
});

test("skipped store jobs never hide unreleased changes; each store has its own baseline", async (t) => {
  const repo = await repository(t);
  const androidChange = await repo.commit("apps/native-kmp/new.kt");
  const head = await repo.commit("docs/only.md");
  const baselines = await findBaselines({
    branch: "dev",
    head,
    runId: 99,
    cwd: repo.cwd,
    stores: true,
    request: async (path) => {
      if (path.includes("workflows/"))
        return { workflow_runs: [run(3, head), run(2, androidChange), run(1, repo.base)] };
      const jobs = path.includes("/3/")
        ? [job("android", "skipped"), job("chrome")]
        : path.includes("/2/")
          ? [job("android", "failure"), job("chrome", "skipped")]
          : [job("android"), job("chrome")];
      return { jobs, total_count: jobs.length };
    },
  });
  assert.deepEqual(baselines, { native: head, android: repo.base, chrome: head });
  assert.deepEqual(storePlan(baselines, head, repo.cwd), { android: true, chrome: false });
  assert.deepEqual(storePlan({}, head, repo.cwd), { android: true, chrome: true });
});

test("history handles workflow and job pagination", async (t) => {
  const repo = await repository(t);
  const requests = [];
  const baselines = await findBaselines({
    branch: "main",
    head: repo.base,
    runId: 100,
    cwd: repo.cwd,
    stores: true,
    request: async (path) => {
      requests.push(path);
      if (path.includes("workflows/"))
        return {
          workflow_runs: path.endsWith("page=1")
            ? Array.from({ length: 100 }, () => run(100, repo.base, { head_branch: "main" }))
            : [run(1, repo.base, { head_branch: "main" })],
        };
      return {
        jobs: path.endsWith("page=1")
          ? [job("android", "success", "main")]
          : [job("chrome", "success", "main")],
        total_count: 101,
      };
    },
  });
  assert.deepEqual(baselines, { native: repo.base, android: repo.base, chrome: repo.base });
  assert.equal(requests.length, 4);
});

test("a deferred Chrome upload does not advance its release baseline", async (t) => {
  const repo = await repository(t);
  const head = await repo.commit("apps/browser-extension/new.ts");
  for (const conclusion of ["success", "skipped"]) {
    const baselines = await findBaselines({
      branch: "dev",
      head,
      runId: 99,
      cwd: repo.cwd,
      stores: true,
      request: async (path) => {
        if (path.includes("workflows/"))
          return { workflow_runs: [run(2, head), run(1, repo.base)] };
        const chrome = job("chrome");
        if (path.includes("/2/"))
          chrome.steps = [{ name: "Record deferred Chrome upload", conclusion }];
        return { jobs: [job("android"), chrome], total_count: 2 };
      },
    });
    const deferred = conclusion === "success";
    assert.equal(baselines.chrome, deferred ? repo.base : head);
    assert.equal(storePlan(baselines, head, repo.cwd).chrome, deferred);
  }
});

test("app-specific changes stay scoped and shared or unknown inputs rebuild both stores", () => {
  for (const path of [
    "README.md",
    "docs/release.md",
    ".changeset/fix.md",
    "apps/api/src/index.ts",
  ]) {
    assert.equal(affectsNative(path), false, path);
    assert.equal(affectsChrome(path), false, path);
  }
  assert.equal(affectsNative("apps/browser-extension/src/content.ts"), false);
  assert.equal(affectsChrome("apps/browser-extension/src/content.ts"), true);
  assert.equal(affectsNative("apps/native-kmp/webview-scripts/src/index.ts"), true);
  assert.equal(affectsChrome("apps/native-kmp/webview-scripts/src/index.ts"), false);
  for (const path of [
    "packages/ao3-core/src/dom.ts",
    "packages/ao3-sync-client/src/index.ts",
    "pnpm-lock.yaml",
    "unknown.json",
  ]) {
    assert.equal(affectsNative(path), true, path);
    assert.equal(affectsChrome(path), true, path);
  }
});

async function workflow(name) {
  return parse(
    await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

test("CI folds detection into workspace checks, preserves the required gate and uses stable metadata", async () => {
  const ci = await workflow("ci");
  assert.equal(ci.jobs["native-changes"], undefined);
  assert.equal(ci.permissions.actions, "read");
  const { workspace, native, android } = ci.jobs;
  assert.equal(workspace.outputs.native_required, "${{ steps.changes.outputs.required }}");
  assert.equal(workspace.outputs.native_matrix, "${{ steps.changes.outputs.matrix }}");
  assert.equal(
    workspace.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with["fetch-depth"],
    0,
  );
  assert.equal(native.needs, "workspace");
  assert.equal(native.if, "needs.workspace.outputs.native_required == 'true'");
  assert.equal(native.strategy.matrix, "${{ fromJSON(needs.workspace.outputs.native_matrix) }}");
  assert.equal(native.env.APP_BUILD_TIME_UTC, "2020-01-01 00:00:00 UTC");
  assert.deepEqual(android.needs, ["workspace", "native"]);
  assert.equal(android.if, "always()");
  assert.match(android.steps[0].run, /NATIVE_REQUIRED.*false.*NATIVE_RESULT.*skipped/);
  assert.match(android.steps[0].run, /exit 1/);
  const release = await workflow("release-android");
  assert.equal(release.jobs.release.env.APP_BUILD_TIME_UTC, undefined);
});

test("store selection runs inside the deployment lock and cannot bypass API success", async () => {
  for (const branch of ["main", "dev"]) {
    for (const name of [
      branch === "main" ? "release-main" : "deploy-dev-api",
      `release-${branch}-apps`,
      branch === "main" ? "deploy-api" : "release-dev-apps",
    ]) {
      assert.equal((await workflow(name)).permissions.actions, "read", name);
    }
    const release = await workflow(`release-${branch}-apps`);
    const dependency = branch === "main" ? "api" : "deploy";
    for (const store of ["android", "chrome"]) {
      assert.equal(release.jobs[store].needs, dependency);
      if (branch === "main" && store === "android") {
        assert.equal(release.jobs[store].if, undefined);
      } else {
        assert.ok(
          release.jobs[store].if.includes(
            `needs.${dependency}.outputs.${store}_required == 'true'`,
          ),
        );
      }
      assert.doesNotMatch(release.jobs[store].if ?? "", /always\(/);
    }
    const deployment = (await workflow(branch === "main" ? "deploy-api" : "release-dev-apps")).jobs
      .deploy;
    assert.equal(
      deployment.outputs.android_required,
      branch === "main" ? undefined : "${{ steps.changes.outputs.android }}",
    );
    assert.equal(deployment.outputs.chrome_required, "${{ steps.changes.outputs.chrome }}");
    assert.equal(
      deployment.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with[
        "fetch-depth"
      ],
      0,
    );
    assert.equal(
      deployment.steps.find((step) => step.id === "changes").run,
      "vp node scripts/ci-native-changes.mjs stores",
    );
  }
});

test("CLI conservatively runs checks and stores when GitHub history is unavailable", async (t) => {
  const repo = await repository(t);
  const head = await repo.commit("docs/only.md");
  const eventPath = join(repo.cwd, "event.json");
  await writeFile(eventPath, JSON.stringify({ after: head }));
  for (const mode of [[], ["stores"]]) {
    const outputPath = join(repo.cwd, mode.length ? "stores.txt" : "checks.txt");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("ci-native-changes.mjs", import.meta.url)), ...mode],
      {
        cwd: repo.cwd,
        stdio: "pipe",
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "push",
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_API_URL: "invalid-url",
          GITHUB_TOKEN: "",
          GITHUB_REPOSITORY: "test/repo",
          GITHUB_REF_NAME: "dev",
          GITHUB_RUN_ID: "42",
        },
      },
    );
    const output = await readFile(outputPath, "utf8");
    if (mode.length) assert.equal(output, "android=true\nchrome=true\n");
    else assert.match(output, /^required=true\n/);
  }
});
