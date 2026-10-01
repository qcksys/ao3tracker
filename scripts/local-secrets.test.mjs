import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const apiRoot = new URL("../apps/api/", import.meta.url);
const require = createRequire(new URL("package.json", apiRoot));
const { unstable_getVarsForDev: getVarsForDev } = require("wrangler");
const config = JSON.parse(await readFile(new URL("wrangler.json", apiRoot), "utf8"));

void test("Wrangler loads only declared secrets from the injected environment", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ao3tracker-secrets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const originalEnv = process.env;
  t.after(() => {
    process.env = originalEnv;
  });
  const secrets = {
    DATABASE_URL: "mysql://local-user:local-password@database.example/dev",
    BETTER_AUTH_SECRET: "test-only-auth-secret-with-more-than-32-characters",
    GOOGLE_ID: "test-google-id",
    GOOGLE_SECRET: "test-google-secret",
    FCM_SERVICE_ACCOUNT: JSON.stringify({ private_key: "first line\nsecond line\n" }, null, 2),
  };
  process.env = {
    ...secrets,
    UNRELATED_SECRET: "must-not-be-a-worker-binding",
  };

  const bindings = getVarsForDev(
    join(dir, "wrangler.json"),
    undefined,
    config.vars,
    undefined,
    true,
    config.secrets,
  );
  for (const [key, value] of Object.entries(secrets)) {
    assert.deepEqual(bindings[key], { type: "secret_text", value });
  }
  assert.equal(bindings.UNRELATED_SECRET, undefined);
  assert.deepEqual(bindings.ENVIRONMENT, { type: "plain_text", value: "local" });

  for (const key of ["GOOGLE_ID", "GOOGLE_SECRET", "FCM_SERVICE_ACCOUNT"]) process.env[key] = "";
  const withoutIntegrations = getVarsForDev(
    join(dir, "wrangler.json"),
    undefined,
    config.vars,
    undefined,
    true,
    config.secrets,
  );
  assert.deepEqual(withoutIntegrations.FCM_SERVICE_ACCOUNT, { type: "secret_text", value: "" });
});

void test("Node database tooling validates the injected environment without a secrets file", () => {
  const script = fileURLToPath(new URL("src/env.ts", apiRoot));
  const options = { encoding: "utf8", timeout: 10_000 };
  const configured = spawnSync(process.execPath, [script], {
    ...options,
    env: { ...process.env, DATABASE_URL: "mysql://test:test@database.example/dev" },
  });
  assert.equal(configured.error, undefined);
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.stdout, "");

  const missing = spawnSync(process.execPath, [script], {
    ...options,
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.equal(missing.error, undefined);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /DATABASE_URL is required/);
});
