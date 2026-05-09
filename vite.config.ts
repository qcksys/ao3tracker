import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "ECHO 0",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});
