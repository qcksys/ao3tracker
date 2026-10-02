import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const extensionDirectory = resolve(root, "apps/browser-extension");

export function extensionIdFromKey(key) {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("The built Chrome manifest is missing its public key.");
  }
  const bytes = Buffer.from(key.replace(/\s/g, ""), "base64");
  try {
    createPublicKey({ key: bytes, format: "der", type: "spki" });
  } catch {
    throw new Error("The built Chrome manifest key is not a valid public key.");
  }
  // Chromium hashes the DER public key and maps the first 32 hex digits to a–p.
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

export function verifyRelease({ manifest, apiConfig, env }) {
  const channel = env.RELEASE_CHANNEL || "production";
  if (channel !== "production" && channel !== "beta") {
    throw new Error("RELEASE_CHANNEL must be production or beta.");
  }
  if (
    channel === "beta" &&
    (manifest.name !== "AO3 Tracker Beta" ||
      manifest.host_permissions?.length !== 2 ||
      !manifest.host_permissions.includes("https://archiveofourown.org/*") ||
      !manifest.host_permissions.includes("https://dev.ao3tracker.com/*"))
  ) {
    throw new Error(
      "Beta builds must be labelled AO3 Tracker Beta and allow only AO3 and the dev API.",
    );
  }
  if (env.CHROME_BUILD_ONLY === "true") return null;
  if (env.CHROME_BUILD_ONLY && env.CHROME_BUILD_ONLY !== "false") {
    throw new Error("CHROME_BUILD_ONLY must be true or false.");
  }
  const extensionId = env.CHROME_EXTENSION_ID;
  const publisherId = env.CHROME_PUBLISHER_ID;
  if (channel === "beta" && extensionId === "hjonebiohecalkggemeneaaohafldkkl") {
    throw new Error("Beta releases must use a separate Chrome Web Store item.");
  }
  if (!/^[a-p]{32}$/.test(extensionId ?? "") || !/^[A-Za-z0-9_-]+$/.test(publisherId ?? "")) {
    throw new Error(
      "Set the channel's Chrome item ID and CHROME_PUBLISHER_ID in GitHub variables. " +
        "For a new listing, run with build_only=true and upload the ZIP in the Developer Dashboard first.",
    );
  }
  const manifestId = extensionIdFromKey(manifest.key);
  if (manifestId !== extensionId) {
    throw new Error(
      `Manifest key produces ${manifestId}, but the store item is ${extensionId}. ` +
        "Use the store item's Package > View public key in CHROME_BETA_PUBLIC_KEY (beta) or wxt.config.ts (production), " +
        "then deploy the matching API origin before uploading.",
    );
  }
  const origin = `chrome-extension://${extensionId}`;
  for (const environment of channel === "beta" ? [] : ["dev", "prod"]) {
    const allowedOrigins = apiConfig.env?.[environment]?.vars?.ALLOWED_ORIGINS;
    if (
      !allowedOrigins
        ?.split(",")
        .map((value) => value.trim())
        .includes(origin)
    ) {
      throw new Error(
        `Add the exact ${origin} to ${environment} ALLOWED_ORIGINS in apps/api/wrangler.json ` +
          "and deploy that API configuration before uploading the extension.",
      );
    }
  }
  return { extensionId, publisherId, channel };
}

export async function verifyBetaApiOrigin(release, request = fetch) {
  if (release?.channel !== "beta") return;
  const origin = `chrome-extension://${release.extensionId}`;
  const response = await request("https://dev.ao3tracker.com/auth/get-session", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok || response.headers.get("access-control-allow-origin") !== origin) {
    throw new Error(
      "Deploy the dev API with CHROME_BETA_EXTENSION_ID before uploading the beta extension.",
    );
  }
}

export function createChromeUpload({ release, zip, credentials, env }) {
  if (!release) throw new Error("Store upload is disabled in build-only mode.");
  if (
    credentials?.type !== "service_account" ||
    typeof credentials.client_email !== "string" ||
    !credentials.client_email.endsWith(".gserviceaccount.com") ||
    typeof credentials.private_key !== "string"
  ) {
    throw new Error("CHROME_SERVICE_ACCOUNT_JSON must contain a Google service-account key.");
  }
  try {
    createPrivateKey(credentials.private_key);
  } catch {
    throw new Error("CHROME_SERVICE_ACCOUNT_JSON contains an invalid private key.");
  }
  const childEnv = Object.fromEntries(
    Object.entries(env).filter(([name]) => !/^(CHROME|FIREFOX|EDGE|OPERA)_/.test(name)),
  );
  return {
    args: [
      resolve(extensionDirectory, "node_modules/wxt/bin/wxt.mjs"),
      "submit",
      "--chrome-api-version",
      "v2",
      "--chrome-extension-id",
      release.extensionId,
      "--chrome-publisher-id",
      release.publisherId,
      "--chrome-zip",
      zip,
      "--chrome-skip-submit-review",
      release.channel === "beta" ? "false" : "true",
      "--chrome-cancel-pending",
      "false",
      "--chrome-skip-review",
      "false",
    ],
    env: {
      ...childEnv,
      CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL: credentials.client_email,
      CHROME_SERVICE_ACCOUNT_PRIVATE_KEY: credentials.private_key,
    },
  };
}

export async function releaseChrome(command, { env = process.env, run = spawnSync } = {}) {
  if (command !== "verify" && command !== "upload") {
    throw new Error("Usage: node scripts/release-chrome.mjs verify|upload");
  }
  const suffix = env.RELEASE_CHANNEL === "beta" ? "-beta" : "";
  const manifest = JSON.parse(
    await readFile(
      resolve(extensionDirectory, `.output/chrome-mv3${suffix}/manifest.json`),
      "utf8",
    ),
  );
  const apiConfig = JSON.parse(await readFile(resolve(root, "apps/api/wrangler.json"), "utf8"));
  const release = verifyRelease({ manifest, apiConfig, env });
  await verifyBetaApiOrigin(release);
  if (command === "verify") {
    console.log(
      release
        ? "Chrome store identity and configured API origins match."
        : "Build-only ZIP is ready for manual listing setup.",
    );
    return;
  }
  if (!release) throw new Error("Store upload is disabled in build-only mode.");
  const outputDirectory = resolve(extensionDirectory, ".output");
  const zips = (await readdir(outputDirectory)).filter((name) =>
    name.endsWith(`-chrome${suffix}.zip`),
  );
  if (zips.length !== 1)
    throw new Error("Expected exactly one Chrome ZIP in .output; rebuild in a clean checkout.");
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Run google-github-actions/auth with CHROME_SERVICE_ACCOUNT_JSON before uploading.",
    );
  }
  let credentials;
  try {
    credentials = JSON.parse(await readFile(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  } catch {
    throw new Error("Unable to read the Google service-account credentials file.");
  }
  const upload = createChromeUpload({
    release,
    zip: resolve(outputDirectory, zips[0]),
    credentials,
    env,
  });
  const result = run(process.execPath, upload.args, {
    cwd: extensionDirectory,
    env: upload.env,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Chrome upload failed. Check the WXT result and store dashboard before retrying.",
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releaseChrome(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
