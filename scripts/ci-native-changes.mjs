import { execFileSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function needsNativeChecks(eventName, event, cwd = process.cwd()) {
  // Pushes can trigger releases, so validate every release candidate in full.
  if (eventName !== "pull_request") return true;

  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (![base, head].every((sha) => /^[0-9a-f]{40}$/.test(sha ?? ""))) return true;

  let changedFiles;
  try {
    changedFiles = execFileSync(
      "git",
      ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    console.warn("Could not determine changed files; running all native checks.");
    return true;
  }

  return changedFiles
    .split("\0")
    .filter(Boolean)
    .some(
      (path) =>
        !(
          path.endsWith(".md") ||
          path.startsWith("docs/") ||
          path.startsWith(".changeset/") ||
          path.startsWith("apps/api/") ||
          path.startsWith("apps/browser-extension/")
        ),
    );
}

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const required = needsNativeChecks(process.env.GITHUB_EVENT_NAME, event);
  await appendFile(process.env.GITHUB_OUTPUT, `required=${required}\n`);
  console.log(required ? "Native checks required." : "No native build inputs changed.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
