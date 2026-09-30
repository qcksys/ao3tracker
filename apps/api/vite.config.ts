import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

/**
 * Vite (via vite-plus, the workspace's standard toolchain) is the build/dev
 * tool for the worker. The Cloudflare plugin wires Vite's environment API to
 * Workers — `vite dev` runs the worker locally via miniflare (reading bindings
 * from [wrangler.json](wrangler.json)), `vite build` emits a deploy-ready
 * bundle to `dist/`, and `wrangler deploy` uploads it.
 *
 * The `@tailwindcss/vite` plugin lets the worker's static pages import their
 * source CSS directly with `?inline`, returning the compiled+minified
 * Tailwind output as a string — no separate build step, no CDN, no wrangler
 * `Text` module rule.
 *
 * `ssr.resolve.conditions` picks the `workerd`/`worker` export conditions for
 * deps that ship a worker-compatible build (e.g. `hono`, `better-auth`).
 * Without this, transitive Node-only deps like `clean-css` get pulled in and
 * Rolldown (Vite 8) emits their CJS `require("http")` calls, which throw at
 * Workers runtime.
 *
 * `vite build --mode dev` / `--mode prod` is mapped to `CLOUDFLARE_ENV` so the
 * cloudflare plugin reads the right wrangler env section — keeps cross-env
 * out of package.json scripts.
 */
export default defineConfig(({ mode }) => {
  if (mode === "dev" || mode === "prod") {
    process.env.CLOUDFLARE_ENV = mode;
  }
  return {
    resolve: {
      tsconfigPaths: true,
      alias: {
        // `html-minifier-terser` is pulled in transitively via
        // `@scalar/openapi-to-markdown` purely as a build-time helper —
        // the markdown conversion path never minifies HTML at runtime.
        // Stubbing the root drops it AND its CJS-only deps (`clean-css`,
        // `relateurl`, `terser`, `entities`) which use
        // `require("http")` / `require("url")` calls Rolldown doesn't
        // tree-shake (unlike esbuild). See src/stubs/html-minifier-terser.ts.
        "html-minifier-terser": fileURLToPath(
          new URL("./src/stubs/html-minifier-terser.ts", import.meta.url),
        ),
      },
    },
    plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tailwindcss()],
    ssr: {
      resolve: {
        conditions: ["workerd", "worker", "browser"],
      },
    },
  };
});
