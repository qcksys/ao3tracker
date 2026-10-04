import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createChromeUpload,
  extensionIdFromKey,
  uploadChrome,
  verifyBetaApiOrigin,
  verifyRelease,
} from "./release-chrome.mjs";

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

const pendingReviewError = `Chrome Web Store Error: Fetch request failed with code 400 Bad Request: ${JSON.stringify(
  {
    error: {
      code: 400,
      message: "You may not edit or publish an item that is in review.",
      status: "FAILED_PRECONDITION",
      details: [{ reason: "NOT_UPDATEABLE", domain: "chromewebstore.googleapis.com" }],
    },
  },
)}`;

test("beta review conflicts defer the upload and report it without cancelling review", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "chrome-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const releaseEnv = {
    GITHUB_OUTPUT: join(directory, "output"),
    GITHUB_STEP_SUMMARY: join(directory, "summary"),
  };
  const uploaded = await uploadChrome({
    release: { channel: "beta" },
    upload: { args: ["wxt", "submit"], env: {} },
    env: releaseEnv,
    run: (_command, args) => {
      assert.deepEqual(args, ["wxt", "submit"]);
      return { status: 1, stderr: pendingReviewError };
    },
  });
  assert.equal(uploaded, false);
  assert.equal(await readFile(releaseEnv.GITHUB_OUTPUT, "utf8"), "deferred=true\n");
  assert.match(await readFile(releaseEnv.GITHUB_STEP_SUMMARY, "utf8"), /not uploaded/);
});

test("only the known beta review conflict is deferred; other upload failures still fail", async () => {
  for (const [channel, result] of [
    ["production", { status: 1, stderr: pendingReviewError }],
    ["beta", { status: 1, stderr: "Invalid credentials" }],
    ["beta", { status: 1, stderr: pendingReviewError.replace("NOT_UPDATEABLE", "OTHER_ERROR") }],
    ["beta", { status: 1, stderr: pendingReviewError.replace("in review", "disabled") }],
    ["beta", { status: null, error: new Error("spawn failed"), stderr: pendingReviewError }],
  ]) {
    await assert.rejects(
      uploadChrome({
        release: { channel },
        upload: { args: [], env: {} },
        env: {},
        run: () => result,
      }),
      /Chrome upload failed/,
    );
  }
  assert.equal(
    await uploadChrome({
      release: { channel: "beta" },
      upload: { args: [], env: {} },
      env: {},
      run: () => ({ status: 0 }),
    }),
    true,
  );
});

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
    /Manifest key produces .* but the store item is/,
  );
  assert.deepEqual(verifyRelease({ manifest, apiConfig, env }), {
    extensionId,
    publisherId: "publisher-123",
    channel: "production",
  });
});

test("release requires exact dev and prod auth origins, never a wildcard", () => {
  for (const environment of ["dev", "prod"]) {
    const config = structuredClone(apiConfig);
    config.env[environment].vars.ALLOWED_ORIGINS = "chrome-extension://*";
    assert.throws(() => verifyRelease({ manifest, apiConfig: config, env }), /Add the exact/);
  }
});

test("v2 uploads submit only beta, never cancel reviews, and keep secrets out of arguments", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const credentials = {
    type: "service_account",
    client_email: "chrome@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
  };
  const upload = createChromeUpload({
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
  const betaUpload = createChromeUpload({
    release: { extensionId: "a".repeat(32), publisherId: "publisher-123", channel: "beta" },
    zip: "release-chrome-beta.zip",
    credentials,
    env,
  });
  assert.equal(
    betaUpload.args[betaUpload.args.indexOf("--chrome-skip-submit-review") + 1],
    "false",
  );
  assert.equal(betaUpload.args[betaUpload.args.indexOf("--chrome-cancel-pending") + 1], "false");
});

test("upload refuses build-only mode and invalid service-account credentials", () => {
  assert.throws(() => createChromeUpload({ release: null }), /build-only/);
  assert.throws(
    () => createChromeUpload({ release: { extensionId }, credentials: {} }),
    /service-account key/,
  );
});

test("beta releases require a separate identity and dev-only manifest", () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const betaKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const betaId = extensionIdFromKey(betaKey);
  const betaManifest = {
    key: betaKey,
    name: "AO3 Tracker Beta",
    host_permissions: ["https://archiveofourown.org/*", "https://dev.ao3tracker.com/*"],
  };
  const betaEnv = { ...env, RELEASE_CHANNEL: "beta", CHROME_EXTENSION_ID: betaId };
  assert.deepEqual(verifyRelease({ manifest: betaManifest, apiConfig: {}, env: betaEnv }), {
    extensionId: betaId,
    publisherId: env.CHROME_PUBLISHER_ID,
    channel: "beta",
  });
  assert.throws(
    () =>
      verifyRelease({
        manifest: betaManifest,
        apiConfig,
        env: { ...betaEnv, CHROME_EXTENSION_ID: extensionId },
      }),
    /separate/,
  );
  assert.throws(
    () =>
      verifyRelease({
        manifest: {
          ...betaManifest,
          host_permissions: [...betaManifest.host_permissions, "https://ao3tracker.com/*"],
        },
        apiConfig,
        env: betaEnv,
      }),
    /only AO3 and the dev API/,
  );
  assert.throws(
    () => verifyRelease({ manifest, apiConfig, env: { ...env, RELEASE_CHANNEL: "invalid" } }),
    /RELEASE_CHANNEL/,
  );
  assert.equal(
    verifyRelease({
      manifest: { ...betaManifest, key: undefined },
      apiConfig: {},
      env: { RELEASE_CHANNEL: "beta", CHROME_BUILD_ONLY: "true" },
    }),
    null,
  );
});

test("beta upload requires the deployed dev API to accept its exact origin", async () => {
  const betaRelease = { channel: "beta", extensionId: "a".repeat(32) };
  const betaOrigin = `chrome-extension://${betaRelease.extensionId}`;
  await verifyBetaApiOrigin(betaRelease, async (url, options) => {
    assert.equal(url, "https://dev.ao3tracker.com/auth/get-session");
    assert.equal(options.method, "OPTIONS");
    assert.equal(options.headers.Origin, betaOrigin);
    return new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": betaOrigin },
    });
  });
  for (const allowedOrigin of ["*", origin, ""]) {
    await assert.rejects(
      verifyBetaApiOrigin(
        betaRelease,
        async () =>
          new Response(null, {
            status: 204,
            headers: { "access-control-allow-origin": allowedOrigin },
          }),
      ),
      /Deploy the dev API/,
    );
  }
  await verifyBetaApiOrigin(null, () => {
    throw new Error("Build-only must not contact the API");
  });
});
