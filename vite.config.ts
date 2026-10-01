import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "ECHO 0",
  },
  fmt: {
    tabWidth: 2,
    endOfLine: "lf",
    ignorePatterns: [
      "apps/api/worker-configuration.d.ts",
      "apps/api/src/db/migrations/**/snapshot.json",
      "apps/native-kmp/composeApp/schemas/**",
    ],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
