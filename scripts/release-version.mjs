import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const epoch = Date.UTC(2020, 0, 1);
const maximumVersionCode = 2_100_000_000;

export function createReleaseVersion(timestampMs) {
  if (!Number.isSafeInteger(timestampMs)) {
    throw new Error("Release timestamp must be an integer number of UTC milliseconds.");
  }
  const versionCode = Math.floor((timestampMs - epoch) / 1000);
  if (versionCode <= 20 || versionCode > maximumVersionCode) {
    throw new Error(
      "Release timestamp must produce an Android version code from 21 to 2100000000.",
    );
  }

  const date = new Date(timestampMs);
  const day = `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
  const time = date.toISOString().slice(11, 19).replaceAll(":", "");
  return {
    android_version_code: versionCode,
    android_version_name: `${day}+${time}`,
    chrome_version: `1.${Math.floor(versionCode / 65536)}.${versionCode % 65536}`,
  };
}

// Deployments must be serialized and use a clock that does not move backwards.
// Waiting one second keeps sequential executions, including reruns, distinct.
// Play's version-code limit is reached on 2086-07-18 at 13:20:00 UTC.
export async function nextReleaseVersion({ now = Date.now, wait = setTimeout } = {}) {
  const before = createReleaseVersion(now());
  await wait(1000);
  const after = createReleaseVersion(now());
  if (after.android_version_code <= before.android_version_code) {
    throw new Error("The release clock did not advance; refusing to allocate a duplicate version.");
  }
  return after;
}

async function main() {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/release-version.mjs");
  const versions = await nextReleaseVersion();
  const output = Object.entries(versions)
    .map(([name, value]) => `${name}=${value}\n`)
    .join("");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output, "utf8");
  process.stdout.write(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
