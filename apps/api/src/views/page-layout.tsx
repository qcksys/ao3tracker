import { html, raw } from "hono/html";
import type { Child, FC } from "hono/jsx";
import styles from "~/styles/index.css?inline";

/**
 * Shared <head> chrome for the worker's user-facing pages. The Tailwind CSS
 * is compiled at build time by Vite's `@tailwindcss/vite` plugin and imported
 * inline (via `?inline`) as a string, then embedded in a `<style>` tag — no
 * runtime CSS request, no external CDN.
 */
export const PageLayout: FC<{
  title: string;
  description?: string;
  children?: Child;
}> = (props) => {
  return (
    <html lang="en" class="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title}</title>
        {props.description ? <meta name="description" content={props.description} /> : null}
        <style>{html`${raw(styles)}`}</style>
      </head>
      <body class="min-h-screen bg-linear-to-br from-[#1a1a2e] to-[#16213e] text-white font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
        {props.children}
      </body>
    </html>
  );
};
