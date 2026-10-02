import { PROD_ENV_NAME } from "~/const";

const uploadFingerprint =
  "BF:03:23:05:84:A4:10:7B:87:60:43:7A:61:2E:E2:1F:B1:08:00:D7:F0:4F:42:65:60:37:4C:9C:DB:51:08:50";
const prodPlayFingerprint =
  "53:4D:7E:AC:AF:81:EB:B8:4C:74:B1:22:D1:3A:C1:61:83:20:E3:24:5D:24:F7:D4:60:E7:3C:22:CD:AF:41:B8";
const devPlayFingerprint =
  "78:BD:64:99:EF:60:BF:50:8D:73:A2:5B:DC:C2:8D:E9:B3:91:34:41:23:37:08:9C:DD:EF:88:85:14:A4:66:FE";
const debugFingerprint =
  "E4:F5:42:AE:8F:E7:6F:16:00:C9:69:02:49:35:59:85:A8:09:79:E5:B0:84:60:E1:C2:EE:AC:2C:64:7F:AA:3A";

export function androidAppAssociations(environment: string) {
  if (environment === PROD_ENV_NAME) {
    return [
      {
        packageName: "com.qcksys.ao3tracker",
        fingerprints: [uploadFingerprint, prodPlayFingerprint],
      },
    ];
  }
  return [
    {
      packageName: "com.qcksys.ao3tracker",
      fingerprints: [uploadFingerprint, debugFingerprint],
    },
    {
      packageName: "com.qcksys.ao3tracker.dev",
      fingerprints: [uploadFingerprint, debugFingerprint, devPlayFingerprint],
    },
  ];
}

export function androidPasskeyOrigins(environment: string): string[] {
  const fingerprints = new Set(
    androidAppAssociations(environment).flatMap((app) => app.fingerprints),
  );
  return [...fingerprints].map((fingerprint) => {
    const bytes = fingerprint.split(":").map((hex) => Number.parseInt(hex, 16));
    const hash = btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    return `android:apk-key-hash:${hash}`;
  });
}
