import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const extension = resolve("apps/browser-extension");
const requireExtension = createRequire(resolve(extension, "package.json"));
const { default: tailwindcss } = await import(
  pathToFileURL(requireExtension.resolve("@tailwindcss/vite")).href
);
const root = resolve("assets/store/production");
const fixture = resolve(root, "fixture.jsx");
const server = await createServer({
  configFile: false,
  root,
  publicDir: resolve(extension, "public"),
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "~popup/lib/state": fixture,
      "~popup/lib/auth-client": fixture,
      "~popup": resolve(extension, "entrypoints/popup"),
      "@": extension,
      react: dirname(requireExtension.resolve("react")),
      "react-dom/client": requireExtension.resolve("react-dom/client"),
      "react-router": requireExtension.resolve("react-router"),
      "lucide-react": requireExtension.resolve("lucide-react"),
    },
  },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 4317, strictPort: true },
});
await server.listen();
server.printUrls();
