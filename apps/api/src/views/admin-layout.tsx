import { html } from "hono/html";
import type { Child, FC } from "hono/jsx";
import { PageLayout } from "~/views/page-layout";

export const cardClass = "rounded-xl border border-white/10 bg-white/5 p-5";
export const inputClass =
  "w-full rounded-md border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none focus:border-[#9d4edd]";
export const buttonClass =
  "rounded-md px-4 py-2.5 font-semibold text-white bg-gradient-to-r from-[#9d4edd] to-[#c77dff] disabled:opacity-60 disabled:cursor-not-allowed";

export function formatCount(value: number): string {
  return value.toLocaleString("en");
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** "3 min ago" style age of `then` relative to `now`; "never" for null */
export function formatAge(then: Date | null, now: Date): string {
  if (!then) return "never";
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const signOutScript = html`
  <script>
    document.getElementById("sign-out").addEventListener("click", async function () {
      await fetch("/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(function () {});
      window.location.href = "/admin/sign-in";
    });
  </script>
`;

/** Chrome for the signed-in admin pages: navigation, the signed-in account and sign-out */
export const AdminLayout: FC<{
  title: string;
  active: "dashboard" | "settings";
  email: string;
  environment: string;
  children?: Child;
}> = (props) => {
  const navLink = (href: string, label: string, key: typeof props.active) => (
    <a
      href={href}
      class={
        props.active === key
          ? "rounded-md bg-white/10 px-3 py-1.5 text-white"
          : "rounded-md px-3 py-1.5 text-zinc-300 hover:text-white"
      }
    >
      {label}
    </a>
  );
  return (
    <PageLayout title={`${props.title} — AO3 Tracker admin`}>
      <div class="mx-auto max-w-5xl px-4 py-6">
        <header class="mb-6 flex flex-wrap items-center gap-3">
          <a
            href="/admin"
            class="mr-2 text-lg font-bold bg-gradient-to-r from-[#9d4edd] to-[#c77dff] bg-clip-text text-transparent"
          >
            AO3 Tracker admin
          </a>
          <span class="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-300">
            {props.environment}
          </span>
          <nav class="flex gap-1 text-sm">
            {navLink("/admin", "Dashboard", "dashboard")}
            {navLink("/admin/settings", "Settings", "settings")}
          </nav>
          <div class="ml-auto flex items-center gap-3 text-sm text-zinc-300">
            <span>{props.email}</span>
            <button
              id="sign-out"
              type="button"
              class="rounded-md border border-white/15 px-3 py-1.5 hover:border-white/40"
            >
              Sign out
            </button>
          </div>
        </header>
        <main>{props.children}</main>
      </div>
      {signOutScript}
    </PageLayout>
  );
};
