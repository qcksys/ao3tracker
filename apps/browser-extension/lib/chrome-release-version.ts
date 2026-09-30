export function chromeReleaseVersion(
  version: string | undefined,
  versionName: string | undefined,
): { version?: string; version_name?: string } {
  if (version === undefined) {
    if (versionName !== undefined) {
      throw new Error("CHROME_VERSION_NAME requires CHROME_VERSION.");
    }
    return {};
  }
  if (
    version !== version.trim() ||
    !/^(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){0,3}$/.test(version) ||
    version.split(".").some((part) => Number(part) > 65535) ||
    version.split(".").every((part) => Number(part) === 0)
  ) {
    throw new Error(
      "CHROME_VERSION must contain 1–4 canonical integers from 0 to 65535, with at least one nonzero component.",
    );
  }
  if (versionName !== undefined && (!versionName.trim() || /[\r\n]/.test(versionName))) {
    throw new Error("CHROME_VERSION_NAME must be nonempty and fit on one line.");
  }
  return { version, ...(versionName === undefined ? {} : { version_name: versionName }) };
}
