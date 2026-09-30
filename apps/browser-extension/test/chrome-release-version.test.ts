import { describe, expect, it } from "vitest";
import { chromeReleaseVersion } from "../lib/chrome-release-version";

describe("Chrome release version", () => {
  it("leaves ordinary local builds on the package version", () => {
    expect(chromeReleaseVersion(undefined, undefined)).toEqual({});
  });

  it.each(["1", "0.1", "1.2.3", "0.0.0.1", "65535.65535.65535.65535"])(
    "accepts canonical Chrome version %s without a display name",
    (version) => {
      expect(chromeReleaseVersion(version, undefined)).toEqual({ version });
    },
  );

  it.each([
    "",
    "0",
    "0.0.0.0",
    "1.2.3.4.5",
    "01.2",
    "1.02",
    "1.-2",
    "+1.2",
    "1.65536",
    "100000",
    "1.2.3-beta",
    "1.2.3+build",
    "1e2",
    "1..2",
    "1.2.",
    " 1.2",
    "1.2\n",
  ])("rejects invalid Chrome version %j", (version) => {
    expect(() => chromeReleaseVersion(version, undefined)).toThrow("CHROME_VERSION must");
  });

  it("preserves a descriptive release name independently of the numeric version", () => {
    expect(chromeReleaseVersion("1.2.3.4", "0.0.1-main.123+abc123")).toEqual({
      version: "1.2.3.4",
      version_name: "0.0.1-main.123+abc123",
    });
  });

  it.each(["", " ", "1.2\n3", "1.2\r3"])(
    "rejects an empty or multiline display name %j",
    (name) => {
      expect(() => chromeReleaseVersion("1.2.3", name)).toThrow("CHROME_VERSION_NAME must");
    },
  );

  it("requires a numeric version when overriding the display name", () => {
    expect(() => chromeReleaseVersion(undefined, "release")).toThrow(
      "CHROME_VERSION_NAME requires CHROME_VERSION",
    );
  });
});
