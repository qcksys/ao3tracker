/**
 * Stub for `html-minifier-terser`. Pulled in transitively via
 * `@scalar/openapi-to-markdown` purely as a build-time helper — the markdown
 * conversion path never minifies HTML at runtime. Without this stub, Rolldown
 * (Vite 8) bundles the package and its CJS deps (`clean-css`, `relateurl`,
 * `terser`, `entities`) which use `require("http")` / `require("url")` /
 * `require("fs")` calls that throw on Workers.
 *
 * Aliased in [vite.config.ts](../../vite.config.ts).
 */
export async function minify(value: string): Promise<string> {
    return value;
}

export default { minify };
