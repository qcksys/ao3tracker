import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changelogEntry, packageNotes, playNotes } from "./release-notes.mjs";

const pkg = { name: "@qcksys/ao3tracker-native-kmp", version: "0.2.0" };
const emptyPlan = { releases: [], changesets: [] };
const changelog = `# ${pkg.name}

## 0.3.0

- Future changes.

## 0.2.0

### Minor Changes

- abc1234: Add saved searches.

  Preserve multiline details.

### Patch Changes

- Fix sync.

## 0.1.0

- Old changes.
`;

test("pending notes select this package's changesets without mixing in other apps", () => {
  const plan = {
    releases: [
      { name: pkg.name, type: "minor", newVersion: "0.3.0", changesets: ["native", "shared"] },
    ],
    changesets: [
      { id: "chrome", summary: "Chrome-only change." },
      { id: "shared", summary: "Improve both clients." },
      { id: "native", summary: "Add a reader option.\n\nKeep its details." },
    ],
  };
  const notes = packageNotes(plan, pkg, changelog);
  assert.match(notes.heading, /Pending changes.*0\.3\.0/);
  assert.equal(
    notes.body,
    "- Add a reader option.\n  \n  Keep its details.\n\n- Improve both clients.",
  );
  assert.doesNotMatch(notes.body, /Chrome-only|Old changes|Future changes|saved searches/);
  assert.throws(() => packageNotes({ ...plan, changesets: [] }, pkg), /Missing changeset native/);
});

test("versioned notes use the exact package version and preserve all change sections", () => {
  const notes = packageNotes(emptyPlan, pkg, changelog.replaceAll("\n", "\r\n"));
  assert.equal(notes.heading, `${pkg.name} 0.2.0`);
  assert.match(notes.body, /### Minor Changes/);
  assert.match(notes.body, /Preserve multiline details/);
  assert.match(notes.body, /### Patch Changes/);
  assert.doesNotMatch(notes.body, /Future changes|Old changes|\r/);
  assert.equal(changelogEntry(changelog, "0.2.1"), "");
});

test("packages without recorded notes get an honest fallback", () => {
  assert.equal(
    packageNotes(emptyPlan, pkg).body,
    "No user-facing changes were recorded for this package.",
  );
  assert.equal(
    packageNotes(emptyPlan, { ...pkg, version: "9.0.0" }, changelog).body,
    "No user-facing changes were recorded for this package.",
  );
});

test("dependency-only releases do not reuse stale changelog entries", () => {
  const plan = {
    changesets: [],
    releases: [{ name: pkg.name, type: "patch", newVersion: "0.2.1", changesets: [] }],
  };
  assert.equal(packageNotes(plan, pkg, changelog).body, "Update workspace dependencies.");
});

test("Google Play notes remove changelog headings, commit IDs and inline Markdown", () => {
  assert.equal(
    playNotes(
      "### Patch Changes\n\n- abc1234: Fix **sync** and `reader` [links](https://example.com).",
    ),
    "- Fix sync and reader links.",
  );
  assert.equal(playNotes(""), "No user-facing changes were recorded for this package.");
});

test("Google Play notes fit 500 Unicode characters without splitting a surrogate pair", () => {
  assert.equal(playNotes("a".repeat(500)), "a".repeat(500));
  assert.equal(playNotes("a".repeat(501)), `${"a".repeat(499)}…`);
  const notes = playNotes("📚".repeat(501));
  assert.equal(Array.from(notes).length, 500);
  assert.equal(notes, `${"📚".repeat(499)}…`);
  assert.equal(notes.isWellFormed(), true);
});

test("Google Play uses each change's opening paragraph while full notes keep the details", () => {
  assert.equal(
    playNotes(
      "- Improve reading progress.\n  \n  Implementation details.\n\n- Fix sync.\n  Preserve wrapped text.\n\n  Migration instructions.",
    ),
    "- Improve reading progress.\n- Fix sync. Preserve wrapped text.",
  );
});

test("CLI writes full artifacts, bounded Play notes and the Actions summary without changing source", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ao3-release-notes-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packageDirectory = join(directory, "package");
  await mkdir(packageDirectory);
  await mkdir(join(directory, ".changeset"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  await writeFile(join(directory, "pnpm-workspace.yaml"), "packages:\n  - package\n");
  await writeFile(
    join(directory, ".changeset", "config.json"),
    await readFile(new URL("../.changeset/config.json", import.meta.url)),
  );
  const packagePath = join(packageDirectory, "package.json");
  const packageJson = JSON.stringify({ ...pkg, private: true });
  await writeFile(packagePath, packageJson);
  const summary = "Improve reading progress. ".repeat(40);
  const changesetPath = join(directory, ".changeset", "progress.md");
  const changeset = `---\n"${pkg.name}": patch\n---\n\n${summary}\n`;
  await writeFile(changesetPath, changeset);
  const output = join(directory, "output");
  const summaryPath = join(directory, "summary.md");
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("release-notes.mjs", import.meta.url)), packageDirectory, output],
    { cwd: directory, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath } },
  );
  assert.equal(result.status, 0, result.stderr);
  const markdown = await readFile(join(output, "release-notes.md"), "utf8");
  assert.ok(markdown.includes(summary.trim()));
  assert.equal(result.stdout, markdown);
  assert.equal(await readFile(summaryPath, "utf8"), `${markdown}\n`);
  assert.equal(
    Array.from(await readFile(join(output, "whatsnew", "whatsnew-en-US"), "utf8")).length,
    500,
  );
  assert.equal(await readFile(packagePath, "utf8"), packageJson);
  assert.equal(await readFile(changesetPath, "utf8"), changeset);

  for (const args of [
    ["init", "--quiet"],
    ["add", ".changeset", "package.json", "package", "pnpm-workspace.yaml"],
    [
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release-test@example.com",
      "commit",
      "--quiet",
      "-m",
      "Add changeset",
    ],
  ]) {
    const git = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr);
  }
  const version = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")), "version"],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(version.status, 0, version.stderr || version.stdout);
  assert.equal(JSON.parse(await readFile(packagePath, "utf8")).version, "0.2.1");
  await assert.rejects(readFile(changesetPath), { code: "ENOENT" });
  const versioned = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("release-notes.mjs", import.meta.url)), packageDirectory, output],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(versioned.status, 0, versioned.stderr);
  assert.ok(versioned.stdout.includes(summary.trim()));
  assert.match(versioned.stdout, /0\.2\.1/);
  assert.doesNotMatch(versioned.stdout, /Pending changes|Future changes|Old changes/);
});
