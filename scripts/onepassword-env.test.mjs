import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiRoot = new URL("../apps/api/", import.meta.url);
const require = createRequire(new URL("package.json", apiRoot));
const { internal } = await import(pathToFileURL(require.resolve("varlock")).href);

async function resolveNote(t, content, exitCode = 0) {
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
  });
  assert.equal(graph.configItemsProcessed, true);
  await graph.resolveEnvValues();
  assert.equal(calls.length, 1);
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
  const graph = await resolveNote(t, "", 1);
  assert.equal(graph.configSchema.DATABASE_URL.isValid, false);
  assert.equal(graph.configSchema.BETTER_AUTH_SECRET.isValid, false);
});
