import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getReleasePlan } from "@changesets/get-release-plan";

const noNotes = "No user-facing changes were recorded for this package.";

export function changelogEntry(changelog, version) {
  const sections = changelog.replaceAll("\r\n", "\n").split(/^## /m);
  const section = sections.find((entry) => entry.split("\n", 1)[0].trim() === version);
  return section?.slice(section.indexOf("\n") + 1).trim() ?? "";
}

export function packageNotes(plan, pkg, changelog = "") {
  const release = plan.releases.find((entry) => entry.name === pkg.name && entry.type !== "none");
  if (release) {
    const summaries = release.changesets.map((id) => {
      const changeset = plan.changesets.find((entry) => entry.id === id);
      if (!changeset) throw new Error(`Missing changeset ${id} for ${pkg.name}.`);
      return changeset.summary.trim();
    });
    return {
      heading: `Pending changes for ${pkg.name} ${release.newVersion}`,
      body: summaries.length
        ? summaries.map((summary) => `- ${summary.replaceAll("\n", "\n  ")}`).join("\n\n")
        : "Update workspace dependencies.",
    };
  }
  return {
    heading: `${pkg.name} ${pkg.version}`,
    body: changelogEntry(changelog, pkg.version) || noNotes,
  };
}

export function playNotes(markdown) {
  const plain = markdown
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^\s*- [a-f0-9]{7,40}: /gm, "- ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .split(/\n(?=- )/)
    .map((entry) =>
      entry
        .trim()
        .split(/\n\s*\n/, 1)[0]
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .join("\n");
  const characters = Array.from(plain || noNotes);
  return characters.length <= 500 ? characters.join("") : `${characters.slice(0, 499).join("")}…`;
}

export async function writeReleaseNotes(plan, packageDirectory, outputDirectory) {
  const pkg = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  const changelog = await readFile(join(packageDirectory, "CHANGELOG.md"), "utf8").catch(
    (error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    },
  );
  const notes = packageNotes(plan, pkg, changelog);
  const markdown = `# ${notes.heading}\n\n${notes.body}\n`;
  await mkdir(join(outputDirectory, "whatsnew"), { recursive: true });
  await writeFile(join(outputDirectory, "release-notes.md"), markdown, "utf8");
  await writeFile(
    join(outputDirectory, "whatsnew", "whatsnew-en-US"),
    playNotes(notes.body),
    "utf8",
  );
  return markdown;
}

async function main() {
  if (process.argv.length !== 4) {
    throw new Error("Usage: node scripts/release-notes.mjs <package-directory> <output-directory>");
  }
  const plan = await getReleasePlan(process.cwd());
  const markdown = await writeReleaseNotes(plan, ...process.argv.slice(2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
  }
  process.stdout.write(markdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
