import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("Changesets reports only new private-package tags for production release gating", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ao3-release-tags-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "tags.ndjson");
  const env = { ...process.env, CHANGESETS_OUTPUT: output };
  const cli = fileURLToPath(import.meta.resolve("@changesets/cli/bin.js"));
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: directory, encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    return result.stdout.trim();
  }
  async function tag() {
    await writeFile(output, "");
    run(process.execPath, [cli, "git-tag"]);
    const report = (await readFile(output, "utf8")).trim();
    return report ? report.split("\n").map((line) => JSON.parse(line)) : [];
  }

  await mkdir(join(directory, ".changeset"));
  await writeFile(
    join(directory, ".changeset", "config.json"),
    await readFile(new URL("../.changeset/config.json", import.meta.url)),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  await writeFile(join(directory, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  for (const name of ["api", "client"]) {
    await mkdir(join(directory, "packages", name), { recursive: true });
    await writeFile(
      join(directory, "packages", name, "package.json"),
      JSON.stringify({ name: `@fixture/${name}`, version: "1.0.0", private: true }),
    );
  }
  run("git", ["init", "--quiet"]);
  run("git", ["config", "user.name", "Release test"]);
  run("git", ["config", "user.email", "release-test@example.com"]);
  run("git", ["config", "commit.gpgsign", "false"]);
  run("git", ["config", "tag.gpgsign", "false"]);
  run("git", ["add", "."]);
  run("git", ["commit", "--quiet", "-m", "Initial packages"]);

  const first = await tag();
  assert.deepEqual(
    first.map((event) => event.tag).sort((a, b) => a.localeCompare(b)),
    ["@fixture/api@1.0.0", "@fixture/client@1.0.0"],
  );
  const initialSha = run("git", ["rev-parse", "HEAD"]);
  for (const event of first) {
    assert.equal(event.type, "git-tag");
    assert.equal(run("git", ["rev-parse", `${event.tag}^{commit}`]), initialSha);
  }
  assert.deepEqual(await tag(), [], "existing versions must not trigger another deployment");

  await writeFile(
    join(directory, ".changeset", "api-fix.md"),
    '---\n"@fixture/api": patch\n---\n\nFix the API.\n',
  );
  run(process.execPath, [cli, "version"]);
  run("git", ["add", ".changeset", "packages"]);
  run("git", ["commit", "--quiet", "-m", "Version packages"]);
  const versionSha = run("git", ["rev-parse", "HEAD"]);
  assert.deepEqual(await tag(), [
    { type: "git-tag", tag: "@fixture/api@1.0.1", packageName: "@fixture/api" },
  ]);
  assert.equal(run("git", ["rev-parse", "@fixture/api@1.0.1^{commit}"]), versionSha);
  assert.equal(run("git", ["rev-parse", "@fixture/client@1.0.0^{commit}"]), initialSha);
  assert.deepEqual(await tag(), []);
});
