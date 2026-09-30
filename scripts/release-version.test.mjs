import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createReleaseVersion, nextReleaseVersion } from "./release-version.mjs";

const epoch = Date.UTC(2020, 0, 1);

function compareChromeVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

test("generates deterministic store versions and a readable UTC version name", () => {
  assert.deepEqual(createReleaseVersion(Date.UTC(2026, 9, 1, 0, 0, 0, 999)), {
    android_version_code: 212976000,
    android_version_name: "2026.10.1+000000",
    chrome_version: "1.3249.49536",
  });
});

test("the lowest accepted version exceeds both existing app baselines", () => {
  assert.throws(() => createReleaseVersion(epoch), /from 21/);
  assert.throws(() => createReleaseVersion(epoch + 20999), /from 21/);
  const version = createReleaseVersion(epoch + 21000);
  assert.equal(version.android_version_code, 21);
  assert.equal(compareChromeVersions(version.chrome_version, "0.0.1"), 1);
});

test("accepts the final Play version code and rejects overflow without wrapping", () => {
  const maximum = createReleaseVersion(epoch + 2_100_000_000_999);
  assert.equal(maximum.android_version_code, 2_100_000_000);
  assert.equal(maximum.android_version_name, "2086.7.18+132000");
  assert.throws(() => createReleaseVersion(epoch + 2_100_000_001_000), /2100000000/);
});

test("rejects invalid types, fractional milliseconds, and timestamps before the epoch", () => {
  for (const value of [undefined, null, "2026-10-01", NaN, Infinity, -Infinity, epoch + 0.5]) {
    assert.throws(() => createReleaseVersion(value), /integer number of UTC milliseconds/);
  }
  for (const value of [-1, 0, epoch - 1, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createReleaseVersion(value), /from 21/);
  }
});

test("Chrome ordering survives its 65535 component rollover", () => {
  const before = createReleaseVersion(epoch + 65535000);
  const after = createReleaseVersion(epoch + 65536000);
  assert.equal(before.chrome_version, "1.0.65535");
  assert.equal(after.chrome_version, "1.1.0");
  assert.equal(compareChromeVersions(after.chrome_version, before.chrome_version), 1);
  assert.ok(after.android_version_code > before.android_version_code);
});

test("versions increase across midnight, month and year boundaries", () => {
  for (const boundary of [
    Date.UTC(2026, 9, 2),
    Date.UTC(2026, 10, 1),
    Date.UTC(2027, 0, 1),
    Date.UTC(2028, 1, 29),
  ]) {
    const before = createReleaseVersion(boundary - 1000);
    const after = createReleaseVersion(boundary);
    assert.equal(after.android_version_code, before.android_version_code + 1);
    assert.equal(compareChromeVersions(after.chrome_version, before.chrome_version), 1);
  }
});

test("Chrome components remain valid throughout the supported Android range", () => {
  for (const code of [21, 65535, 65536, 212976000, 2_100_000_000]) {
    const version = createReleaseVersion(epoch + code * 1000).chrome_version;
    const parts = version.split(".");
    assert.equal(parts.length, 3);
    assert.ok(parts.every((part) => /^(0|[1-9][0-9]*)$/.test(part) && Number(part) <= 65535));
    assert.ok(parts.some((part) => Number(part) > 0));
  }
});

test("serialized executions and immediate reruns always advance the store versions", async () => {
  let timestamp = Date.UTC(2026, 9, 1);
  const clock = {
    now: () => timestamp,
    wait: async (milliseconds) => {
      timestamp += milliseconds;
    },
  };
  const first = await nextReleaseVersion(clock);
  const rerun = await nextReleaseVersion(clock);
  assert.equal(first.android_version_code, 212976001);
  assert.ok(rerun.android_version_code > first.android_version_code);
  assert.equal(compareChromeVersions(rerun.chrome_version, first.chrome_version), 1);
  assert.notEqual(rerun.android_version_name, first.android_version_name);
});

test("refuses a stalled or backwards clock instead of silently reusing a version", async () => {
  for (const backwardsBy of [0, 1000]) {
    let timestamp = Date.UTC(2026, 9, 1);
    await assert.rejects(
      nextReleaseVersion({
        now: () => timestamp,
        wait: async () => {
          timestamp -= backwardsBy;
        },
      }),
      /clock did not advance/,
    );
  }
});

test("the CLI rejects arguments rather than accepting stale run timestamps", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("release-version.mjs", import.meta.url)), "2026-10-01"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.equal(result.stdout, "");
});
