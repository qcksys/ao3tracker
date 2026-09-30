import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { createDraftUpload, extensionIdFromKey, verifyRelease } from "./release-chrome.mjs";

const key =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwoFnrwaltyQEw7hZV6gFzRSwoRKf+VM6adpYolUqVHbVTFigHouyfHOh9GklK4bMIWHBluh5mxmpVnKoaettN+eCytERoTZ4FnGcEVQzJmY778jf6kw5e9ZivP+T5c1+5NzB1sPABr4HQ4qbAOXg1lipUfi0I/ccvfVgoTaCoy62tUrNwRnnkQYqnQvGGb+0VmozPAvq/kX4sMkVbqU98Uai8V1sogXkH8tJwhGrixs7L9atPZkyvV43EbQ3vqEBrL/NY/R61TI6/HxQ0TOWaqOjI39yarRLnFm4JgsAgb56BRtCSR4KSd3ZUjpmp+5nlWToWuW8CqeV80BuMm3CUwIDAQAB";
const extensionId = "hjonebiohecalkggemeneaaohafldkkl";
const origin = `chrome-extension://${extensionId}`;
const manifest = { key };
const env = { CHROME_EXTENSION_ID: extensionId, CHROME_PUBLISHER_ID: "publisher-123" };
const apiConfig = {
  env: {
    dev: { vars: { ALLOWED_ORIGINS: `https://dev.ao3tracker.com, ${origin}` } },
    prod: { vars: { ALLOWED_ORIGINS: `https://ao3tracker.com,${origin}` } },
  },
};

test("derives the Chrome ID from the manifest public key", () => {
  assert.equal(extensionIdFromKey(key), extensionId);
  assert.throws(() => extensionIdFromKey("not a key"), /valid public key/);
  assert.throws(() => extensionIdFromKey(undefined), /missing its public key/);
});

test("bootstrap build does not require store IDs or credentials", () => {
  assert.equal(verifyRelease({ manifest, apiConfig, env: { CHROME_BUILD_ONLY: "true" } }), null);
});

test("release requires real store IDs and a matching manifest key", () => {
  assert.throws(() => verifyRelease({ manifest, apiConfig, env: {} }), /new listing/);
  assert.throws(
    () =>
      verifyRelease({ manifest, apiConfig, env: { ...env, CHROME_EXTENSION_ID: "a".repeat(32) } }),
    /development ID is not a store item ID/,
  );
  assert.deepEqual(verifyRelease({ manifest, apiConfig, env }), {
    extensionId,
    publisherId: "publisher-123",
  });
});

test("release requires exact dev and prod auth origins, never a wildcard", () => {
  for (const environment of ["dev", "prod"]) {
    const config = structuredClone(apiConfig);
    config.env[environment].vars.ALLOWED_ORIGINS = "chrome-extension://*";
    assert.throws(() => verifyRelease({ manifest, apiConfig: config, env }), /Add the exact/);
  }
});

test("draft invocation uses v2 and never submits, cancels review, or sends secrets in arguments", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const credentials = {
    type: "service_account",
    client_email: "chrome@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
  };
  const upload = createDraftUpload({
    release: verifyRelease({ manifest, apiConfig, env }),
    zip: "release-chrome.zip",
    credentials,
    env: { ...env, CHROME_SKIP_SUBMIT_REVIEW: "false", FIREFOX_ZIP: "firefox.zip", PATH: "bin" },
  });
  const flag = (name) => upload.args[upload.args.indexOf(name) + 1];
  assert.equal(flag("--chrome-api-version"), "v2");
  assert.equal(flag("--chrome-skip-submit-review"), "true");
  assert.equal(flag("--chrome-cancel-pending"), "false");
  assert.equal(flag("--chrome-skip-review"), "false");
  assert.equal(upload.args.includes(credentials.private_key), false);
  assert.equal(upload.env.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY, credentials.private_key);
  assert.equal(upload.env.FIREFOX_ZIP, undefined);
  assert.equal(upload.env.CHROME_SKIP_SUBMIT_REVIEW, undefined);
  assert.equal(upload.env.PATH, "bin");
});

test("upload refuses build-only mode and invalid service-account credentials", () => {
  assert.throws(() => createDraftUpload({ release: null }), /build-only/);
  assert.throws(
    () => createDraftUpload({ release: { extensionId }, credentials: {} }),
    /service-account key/,
  );
});
