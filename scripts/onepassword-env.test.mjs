import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiRoot = new URL("../apps/api/", import.meta.url);
const require = createRequire(new URL("package.json", apiRoot));
const { internal } = await import(pathToFileURL(require.resolve("varlock")).href);

async function resolveNote(t, content, { exitCode = 0, expectedCalls = 1, ...loadOptions } = {}) {
  const calls = [];
  t.mock.method(childProcess, "spawn", (command, args) => {
    assert.equal(command, "op");
    assert.equal(args[0], "inject");
    const template = readFileSync(args[args.indexOf("-i") + 1], "utf8");
    const references = template.match(/\{\{\s*op:\/\/[^}]+\}\}/g);
    assert.equal(references.length, 1);
    calls.push(references[0]);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      if (exitCode === 0) child.stdout.end(template.replace(references[0], () => content));
      else child.stderr.end("Could not connect to the 1Password desktop app");
      child.emit("exit", exitCode);
    });
    return child;
  });
  const graph = await internal.loadEnvGraph({
    basePath: fileURLToPath(apiRoot),
    entryFilePaths: [fileURLToPath(new URL(".env.schema", apiRoot))],
    overrideValues: {},
    processEnvOverride: {},
    checkGitIgnored: false,
    skipCache: true,
    ...loadOptions,
  });
  assert.equal(graph.configItemsProcessed, true);
  await graph.resolveEnvValues();
  assert.equal(calls.length, expectedCalls);
  return graph;
}

void test("Varlock and its 1Password plugin load one dotenv note into the API schema", async (t) => {
  const fcm = JSON.stringify({ private_key: "first line\nsecond line\n" }, null, 2);
  const graph = await resolveNote(
    t,
    `DATABASE_URL='mysql://user:pass@database.example/dev'
BETTER_AUTH_SECRET='test-secret-with-spaces # and $literal'
GOOGLE_ID=test-google-id
GOOGLE_SECRET=test-google-secret
FCM_SERVICE_ACCOUNT='${fcm}'
UNRELATED_SECRET=must-not-be-injected`,
  );
  const values = graph.getResolvedEnvStringObject();
  assert.equal(values.DATABASE_URL, "mysql://user:pass@database.example/dev");
  assert.equal(values.BETTER_AUTH_SECRET, "test-secret-with-spaces # and $literal");
  assert.equal(values.FCM_SERVICE_ACCOUNT, fcm);
  assert.equal(values.UNRELATED_SECRET, undefined);
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "FCM_SERVICE_ACCOUNT"]) {
    assert.equal(graph.configSchema[key].isValid, true);
    assert.equal(graph.configSchema[key].isSensitive, true);
  }
});

void test("optional integrations may be omitted but the auth secret is required", async (t) => {
  const graph = await resolveNote(t, "DATABASE_URL=mysql://user:pass@database.example/dev");
  assert.equal(graph.configSchema.DATABASE_URL.isValid, true);
  assert.equal(graph.configSchema.BETTER_AUTH_SECRET.isValid, false);
  for (const key of ["GOOGLE_ID", "GOOGLE_SECRET", "FCM_SERVICE_ACCOUNT"]) {
    assert.equal(graph.configSchema[key].isValid, true);
  }
});

void test("1Password authentication failure leaves the required config invalid", async (t) => {
  const graph = await resolveNote(t, "", { exitCode: 1 });
  assert.equal(graph.configSchema.DATABASE_URL.isValid, false);
  assert.equal(graph.configSchema.BETTER_AUTH_SECRET.isValid, false);
});

void test("1Password notes use an encrypted one-hour cache with bypass and refresh support", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao3tracker-varlock-cache-"));
  const originalEnv = process.env;
  process.env = { ...process.env, XDG_CONFIG_HOME: dir };
  t.after(async () => {
    process.env = originalEnv;
    await rm(dir, { recursive: true, force: true });
  });
  const options = {
    skipCache: false,
    processEnvOverride: { CI: "true", _VARLOCK_CACHE_KEY: randomBytes(32).toString("hex") },
  };
  const databaseUrl = "mysql://cache-test:cache-password@database.example/dev";
  const note = `DATABASE_URL=${databaseUrl}\nBETTER_AUTH_SECRET=cache-test-auth-secret`;
  const first = await resolveNote(t, note, options);
  assert.equal(first._cacheMode, "disk");
  assert.equal(first.configSchema.DATABASE_URL.isValid, true);

  const cacheFile = first._cacheStore.getFilePath();
  const cacheText = await readFile(cacheFile, "utf8");
  assert.equal(cacheText.includes(databaseUrl), false);
  assert.equal(cacheText.includes("cache-test-auth-secret"), false);
  const entries = Object.values(JSON.parse(cacheText));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].e - entries[0].c, 60 * 60 * 1000);

  const cached = await resolveNote(t, "", { ...options, exitCode: 1, expectedCalls: 0 });
  assert.deepEqual(cached.getResolvedEnvStringObject(), first.getResolvedEnvStringObject());
  assert.equal(cached.configSchema.BETTER_AUTH_SECRET.isSensitive, true);

  const updatedNote = note.replace("cache-test-auth-secret", "updated-cache-test-secret");
  const bypassed = await resolveNote(t, updatedNote, { ...options, skipCache: true });
  assert.equal(
    bypassed.getResolvedEnvStringObject().BETTER_AUTH_SECRET,
    "updated-cache-test-secret",
  );
  assert.equal(await readFile(cacheFile, "utf8"), cacheText);

  const refreshed = await resolveNote(t, updatedNote, { ...options, clearCache: true });
  assert.equal(
    refreshed.getResolvedEnvStringObject().BETTER_AUTH_SECRET,
    "updated-cache-test-secret",
  );
  const updated = await resolveNote(t, "", { ...options, exitCode: 1, expectedCalls: 0 });
  assert.deepEqual(updated.getResolvedEnvStringObject(), refreshed.getResolvedEnvStringObject());

  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 60 * 60 * 1000 + 1 });
  const expired = await resolveNote(t, "", { ...options, exitCode: 1 });
  assert.equal(expired.configSchema.DATABASE_URL.isValid, false);
  assert.equal(expired.configSchema.BETTER_AUTH_SECRET.isValid, false);

  const recovered = await resolveNote(t, note, options);
  assert.equal(recovered.configSchema.DATABASE_URL.isValid, true);
});
