import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isCurrentSuccessfulRun(event, branchSha, branch = "main") {
  const run = event.workflow_run;
  return (
    (branch === "main" || branch === "dev") &&
    run?.name === "CI" &&
    run.conclusion === "success" &&
    run.event === "push" &&
    run.head_branch === branch &&
    Number.isSafeInteger(event.repository?.id) &&
    run.head_repository?.id === event.repository.id &&
    /^[0-9a-f]{40}$/.test(run.head_sha ?? "") &&
    run.head_sha === branchSha
  );
}

export function isCurrentDevPush(event, branchSha, repositoryId) {
  return (
    event.ref === "refs/heads/dev" &&
    event.deleted !== true &&
    Number.isSafeInteger(repositoryId) &&
    event.repository?.id === repositoryId &&
    /^[0-9a-f]{40}$/.test(event.after ?? "") &&
    event.after === branchSha
  );
}

export function assertCurrentSource(sourceRef, branchSha, branch = "main") {
  if (
    (branch !== "main" && branch !== "dev") ||
    !/^[0-9a-f]{40}$/.test(sourceRef ?? "") ||
    sourceRef !== branchSha
  ) {
    throw new Error(
      `Release source is no longer current ${branch}. Release the latest successful CI run instead.`,
    );
  }
}

async function main() {
  const mode = process.argv[2];
  if (process.argv.length > 3 || (mode && mode !== "assert-current-source")) {
    throw new Error("Usage: node scripts/release-main.mjs [assert-current-source]");
  }
  const branch = process.env.RELEASE_BRANCH ?? "main";
  if (branch !== "main" && branch !== "dev") {
    throw new Error("RELEASE_BRANCH must be main or dev.");
  }
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/${branch}`,
    {
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok)
    throw new Error(`Could not resolve ${branch}: GitHub returned ${response.status}.`);
  const ref = await response.json();
  if (mode === "assert-current-source") {
    assertCurrentSource(process.env.RELEASE_SOURCE_REF, ref.object?.sha, branch);
    console.log(`Release source ${process.env.RELEASE_SOURCE_REF} still matches ${branch}.`);
    return;
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  // Direct dev calls rely on CI's needs gate for successful checks.
  const devPush = process.env.GITHUB_EVENT_NAME === "push" && branch === "dev";
  const eligible = devPush
    ? isCurrentDevPush(event, ref.object?.sha, Number(process.env.GITHUB_REPOSITORY_ID))
    : process.env.GITHUB_EVENT_NAME === "workflow_run" &&
      isCurrentSuccessfulRun(event, ref.object?.sha, branch);
  const sourceRef = devPush ? event.after : event.workflow_run?.head_sha;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `eligible=${eligible}\n${eligible ? `source_ref=${sourceRef}\n` : ""}`,
  );
  console.log(
    eligible
      ? `Releasing tested commit ${sourceRef}.`
      : `Skipping release: CI is not a successful same-repository push for the current ${branch} commit.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
