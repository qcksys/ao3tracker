import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isCurrentSuccessfulMainRun(event, mainSha) {
  const run = event.workflow_run;
  return (
    run?.name === "CI" &&
    run.conclusion === "success" &&
    run.event === "push" &&
    run.head_branch === "main" &&
    Number.isSafeInteger(event.repository?.id) &&
    run.head_repository?.id === event.repository.id &&
    /^[0-9a-f]{40}$/.test(run.head_sha ?? "") &&
    run.head_sha === mainSha
  );
}

export function assertCurrentSource(sourceRef, mainSha) {
  if (!/^[0-9a-f]{40}$/.test(sourceRef ?? "") || sourceRef !== mainSha) {
    throw new Error(
      "Release source is no longer current main. Release the latest successful CI run instead.",
    );
  }
}

async function main() {
  const mode = process.argv[2];
  if (process.argv.length > 3 || (mode && mode !== "assert-current-source")) {
    throw new Error("Usage: node scripts/release-main.mjs [assert-current-source]");
  }
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/main`,
    {
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) throw new Error(`Could not resolve main: GitHub returned ${response.status}.`);
  const ref = await response.json();
  if (mode === "assert-current-source") {
    assertCurrentSource(process.env.RELEASE_SOURCE_REF, ref.object?.sha);
    console.log(`Release source ${process.env.RELEASE_SOURCE_REF} still matches main.`);
    return;
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const eligible = isCurrentSuccessfulMainRun(event, ref.object?.sha);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `eligible=${eligible}\n${eligible ? `source_ref=${event.workflow_run.head_sha}\n` : ""}`,
  );
  console.log(
    eligible
      ? `Releasing tested commit ${event.workflow_run.head_sha}.`
      : "Skipping release: CI is not a successful same-repository push for the current main commit.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
