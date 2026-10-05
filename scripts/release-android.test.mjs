import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAndroidRelease } from "./release-android.mjs";

test("production can release to Internal, Alpha, or both while beta stays Internal", () => {
  for (const status of ["completed", "draft"]) {
    for (const tracks of ["internal", "alpha", "internal,alpha"]) {
      assert.doesNotThrow(() => validateAndroidRelease({ channel: "production", tracks, status }));
    }
    assert.doesNotThrow(() =>
      validateAndroidRelease({ channel: "beta", tracks: "internal", status }),
    );
    for (const tracks of ["alpha", "internal,alpha"]) {
      assert.throws(
        () => validateAndroidRelease({ channel: "beta", tracks, status }),
        /only releases to internal/,
      );
    }
  }
});

test("invalid release settings cannot publish to unintended Play tracks", () => {
  const valid = { channel: "production", tracks: "internal", status: "completed" };
  for (const tracks of [
    undefined,
    "",
    "production",
    "beta",
    "internal,production",
    "alpha,internal",
  ]) {
    assert.throws(() => validateAndroidRelease({ ...valid, tracks }), /Release tracks must be/);
  }
  for (const channel of [undefined, "", "alpha"]) {
    assert.throws(() => validateAndroidRelease({ ...valid, channel }), /Release channel must be/);
  }
  for (const status of [undefined, "", "inProgress"]) {
    assert.throws(() => validateAndroidRelease({ ...valid, status }), /Release status must be/);
  }
});
