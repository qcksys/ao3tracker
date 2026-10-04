import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const validSha = (sha) => /^[0-9a-f]{40}$/.test(sha ?? "");
const documentation = (path) =>
  path.endsWith(".md") || path.startsWith("docs/") || path.startsWith(".changeset/");

export function affectsNative(path) {
  return (
    !documentation(path) &&
    !path.startsWith("apps/api/") &&
    !path.startsWith("apps/browser-extension/")
  );
}

export function affectsChrome(path) {
  return (
    !documentation(path) && !path.startsWith("apps/api/") && !path.startsWith("apps/native-kmp/")
  );
}

export function affectsMinification(path) {
  return (
    affectsNative(path) &&
    ((!path.startsWith("apps/native-kmp/") && !path.startsWith("packages/")) ||
      /(?:\.gradle(?:\.kts)?|gradle\.properties|\.toml|\.pro|AndroidManifest\.xml)$/.test(path) ||
      path.includes("/gradle/") ||
      path.endsWith("/gradlew") ||
      path.endsWith("/gradlew.bat") ||
      path.endsWith("/package.json"))
  );
}

export function changedFiles(base, head, cwd = process.cwd(), pullRequest = false) {
  if (![base, head].every(validSha)) return null;
  try {
    return execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        `${base}${pullRequest ? "..." : ".."}${head}`,
        "--",
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
      .split("\0")
      .filter(Boolean);
  } catch {
    console.warn("Could not compare source commits; running the affected checks/releases.");
    return null;
  }
}

export function nativePlan(eventName, event, base, cwd = process.cwd()) {
  const pr = eventName === "pull_request";
  const files = pr
    ? changedFiles(event.pull_request?.base?.sha, event.pull_request?.head?.sha, cwd, true)
    : eventName === "push"
      ? changedFiles(base, event.after, cwd)
      : null;
  const forced = event.pull_request?.labels?.some((label) => label.name === "ci:android-minify");
  const required = files === null || files.some(affectsNative) || !!forced;
  // Push releases validate minification with their signed AAB, not a second APK.
  const minify =
    eventName !== "push" && (files === null || !!forced || files.some(affectsMinification));
  const include = [
    {
      target: "checks",
      name: "JVM tests and Android Debug",
      tasks: ":composeApp:jvmTest :composeApp:assembleDebug",
    },
  ];
  if (minify)
    include.push({ target: "dev", name: "Android Dev build", tasks: ":composeApp:assembleDev" });
  return { required, matrix: { include } };
}

export function needsNativeChecks(eventName, event, cwd = process.cwd()) {
  return nativePlan(eventName, event, undefined, cwd).required;
}

function isAncestor(base, head, cwd) {
  if (![base, head].every(validSha)) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, head], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function findBaselines({
  branch,
  head,
  runId,
  request,
  cwd = process.cwd(),
  stores = false,
}) {
  const result = {};
  for (let page = 1; page <= 10; page++) {
    const data = await request(
      `actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&event=push&status=success&per_page=100&page=${page}`,
    );
    for (const run of data.workflow_runs) {
      if (
        String(run.id) === String(runId) ||
        run.event !== "push" ||
        run.head_branch !== branch ||
        run.conclusion !== "success" ||
        !isAncestor(run.head_sha, head, cwd)
      )
        continue;
      result.native ??= run.head_sha;
      if (!stores) return result;
      for (let jobPage = 1; ; jobPage++) {
        const { jobs, total_count } = await request(
          `actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${jobPage}`,
        );
        for (const store of ["android", "chrome"]) {
          const prefix = branch === "dev" ? "release-dev" : "release-main";
          if (
            jobs.some(
              (job) =>
                job.conclusion === "success" &&
                job.name.startsWith(`${prefix} / deploy / ${store} /`) &&
                !(
                  store === "chrome" &&
                  job.steps?.some(
                    (step) =>
                      step.name === "Record deferred Chrome upload" &&
                      step.conclusion === "success",
                  )
                ),
            )
          )
            result[store] ??= run.head_sha;
        }
        if (jobPage * 100 >= total_count) break;
      }
      if (result.android && result.chrome) return result;
    }
    if (data.workflow_runs.length < 100) break;
  }
  return result;
}

export function storePlan(baselines, head, cwd = process.cwd()) {
  return Object.fromEntries(
    [
      ["android", affectsNative],
      ["chrome", affectsChrome],
    ].map(([store, affects]) => {
      const files = changedFiles(baselines[store], head, cwd);
      return [store, files === null || files.some(affects)];
    }),
  );
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const stores = process.argv[2] === "stores";
  let baselines = {};
  if (process.env.GITHUB_EVENT_NAME === "push") {
    try {
      baselines = await findBaselines({
        branch: process.env.GITHUB_REF_NAME,
        head: event.after,
        runId: process.env.GITHUB_RUN_ID,
        stores,
        request: async (path) => {
          const response = await fetch(
            `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
            {
              headers: {
                authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
          return response.json();
        },
      });
    } catch (error) {
      console.warn(`Could not find successful history; running checks/releases: ${error.message}`);
    }
  }
  const outputs = stores
    ? storePlan(baselines, event.after)
    : nativePlan(process.env.GITHUB_EVENT_NAME, event, baselines.native);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
      .join(""),
  );
  console.log(JSON.stringify({ baselines, ...outputs }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
