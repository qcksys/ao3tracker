import { PROD_ENV_NAME } from "~/const";

const releaseFingerprint =
  "BF:03:23:05:84:A4:10:7B:87:60:43:7A:61:2E:E2:1F:B1:08:00:D7:F0:4F:42:65:60:37:4C:9C:DB:51:08:50";
const debugFingerprint =
  "E4:F5:42:AE:8F:E7:6F:16:00:C9:69:02:49:35:59:85:A8:09:79:E5:B0:84:60:E1:C2:EE:AC:2C:64:7F:AA:3A";

export function androidAppFingerprints(environment: string): string[] {
  return environment === PROD_ENV_NAME
    ? [releaseFingerprint]
    : [releaseFingerprint, debugFingerprint];
}

export function androidPasskeyOrigins(environment: string): string[] {
  return androidAppFingerprints(environment).map((fingerprint) => {
    const bytes = fingerprint.split(":").map((hex) => Number.parseInt(hex, 16));
    const hash = btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    return `android:apk-key-hash:${hash}`;
  });
}
