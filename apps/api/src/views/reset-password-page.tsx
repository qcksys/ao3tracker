import { html } from "hono/html";
import type { FC } from "hono/jsx";
import { PageLayout } from "~/views/page-layout";

/**
 * Inline client script that wires the form. Embedded via the `html` template
 * literal so the body is emitted raw (JSX would otherwise HTML-escape `<` and
 * the JS template-literal `\`s would break).
 *
 * The Better Auth `forget-password` flow puts `?token=…` (or `?error=…`) on
 * the redirect URL — this script pulls it from the query string and POSTs the
 * new password to `/auth/reset-password`.
 */
const inlineScript = html`
  <script>
    (function () {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const error = params.get("error");
      const statusEl = document.getElementById("status");
      const form = document.getElementById("form");
      const submitBtn = document.getElementById("submit");

      function setStatus(message, ok) {
        statusEl.textContent = message;
        statusEl.className =
          "mt-4 text-sm min-h-[1.2em] " + (ok ? "text-emerald-300" : "text-rose-300");
      }

      if (error || !token) {
        setStatus(
          "This reset link is invalid or has expired. Request a new one from the app.",
          false,
        );
        submitBtn.disabled = true;
        return;
      }

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const newPassword = document.getElementById("newPassword").value;
        const confirm = document.getElementById("confirm").value;
        if (newPassword !== confirm) {
          setStatus("Passwords do not match.", false);
          return;
        }
        submitBtn.disabled = true;
        setStatus("Updating…", true);
        try {
          const res = await fetch("/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword: newPassword, token: token }),
          });
          if (!res.ok) {
            const body = await res.json().catch(function () {
              return {};
            });
            setStatus(
              (body && body.message) || "Could not reset password. The link may have expired.",
              false,
            );
            submitBtn.disabled = false;
            return;
          }
          setStatus("Password updated. You can now sign in with your new password.", true);
        } catch (err) {
          setStatus("Network error. Try again.", false);
          submitBtn.disabled = false;
        }
      });
    })();
  </script>
`;

export const ResetPasswordPage: FC = () => (
  <PageLayout
    title="Reset your password — AO3 Tracker"
    description="Set a new password for your AO3 Tracker account."
  >
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-8">
        <h1 class="text-2xl font-bold mb-2 bg-gradient-to-r from-[#9d4edd] to-[#c77dff] bg-clip-text text-transparent">
          Reset your password
        </h1>
        <p class="text-zinc-300 text-sm mb-5">Enter a new password for your AO3 Tracker account.</p>
        <form id="form" class="flex flex-col gap-1">
          <label for="newPassword" class="text-xs text-zinc-300 mb-1">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            minlength={8}
            autocomplete="new-password"
            required
            class="w-full mb-3 rounded-md border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none focus:border-[#9d4edd]"
          />
          <label for="confirm" class="text-xs text-zinc-300 mb-1">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            minlength={8}
            autocomplete="new-password"
            required
            class="w-full mb-4 rounded-md border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none focus:border-[#9d4edd]"
          />
          <button
            id="submit"
            type="submit"
            class="w-full rounded-md px-4 py-2.5 font-semibold text-white bg-gradient-to-r from-[#9d4edd] to-[#c77dff] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Update password
          </button>
          <div id="status" class="mt-4 text-sm min-h-[1.2em]"></div>
        </form>
      </div>
    </div>
    {inlineScript}
  </PageLayout>
);
