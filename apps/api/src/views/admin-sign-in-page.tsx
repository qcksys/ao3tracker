import { html } from "hono/html";
import type { FC } from "hono/jsx";
import { buttonClass, cardClass, inputClass } from "~/views/admin-layout";
import { PageLayout } from "~/views/page-layout";

/**
 * Talks to Better Auth's own endpoints, which set the session cookie on success:
 * email/password (then the TOTP step when the account has 2FA), or a passkey through the
 * browser's WebAuthn JSON helpers. The destination comes from `data-next`, which the server has
 * already limited to /admin paths.
 */
const inlineScript = html`
  <script>
    (function () {
      const root = document.getElementById("sign-in");
      const next = root.dataset.next;
      const statusEl = document.getElementById("status");
      const passwordForm = document.getElementById("password-form");
      const totpForm = document.getElementById("totp-form");
      const passkeyButton = document.getElementById("passkey");

      function setStatus(message, ok) {
        statusEl.textContent = message;
        statusEl.className =
          "mt-4 text-sm min-h-[1.2em] " + (ok ? "text-emerald-300" : "text-rose-300");
      }

      async function post(path, body) {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        return { ok: res.ok, data: data };
      }

      function done() {
        setStatus("Signed in.", true);
        window.location.href = next;
      }

      passwordForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        setStatus("Signing in…", true);
        const result = await post("/auth/sign-in/email", {
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }).catch(function () {
          return { ok: false, data: { message: "Network error. Try again." } };
        });
        if (!result.ok) {
          setStatus(result.data.message || "Incorrect email or password.", false);
          return;
        }
        if (result.data.twoFactorRedirect) {
          passwordForm.hidden = true;
          totpForm.hidden = false;
          document.getElementById("code").focus();
          setStatus("Enter the code from your authenticator app.", true);
          return;
        }
        done();
      });

      totpForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const result = await post("/auth/two-factor/verify-totp", {
          code: document.getElementById("code").value.trim(),
        }).catch(function () {
          return { ok: false, data: { message: "Network error. Try again." } };
        });
        if (!result.ok) {
          setStatus(result.data.message || "That code is not valid.", false);
          return;
        }
        done();
      });

      passkeyButton.addEventListener("click", async function () {
        if (!window.PublicKeyCredential || !PublicKeyCredential.parseRequestOptionsFromJSON) {
          setStatus("This browser cannot sign in with a passkey here. Use your password.", false);
          return;
        }
        try {
          setStatus("Waiting for your passkey…", true);
          const optionsRes = await fetch("/auth/passkey/generate-authenticate-options");
          if (!optionsRes.ok) throw new Error("options");
          const options = PublicKeyCredential.parseRequestOptionsFromJSON(await optionsRes.json());
          const credential = await navigator.credentials.get({ publicKey: options });
          const response = credential.toJSON();
          delete response.clientExtensionResults;
          const result = await post("/auth/passkey/verify-authentication", { response: response });
          if (!result.ok) {
            setStatus(result.data.message || "That passkey was not accepted.", false);
            return;
          }
          done();
        } catch (err) {
          setStatus("Passkey sign-in was cancelled or failed.", false);
        }
      });
    })();
  </script>
`;

export const AdminSignInPage: FC<{ next: string }> = (props) => (
  <PageLayout title="Admin sign-in — AO3 Tracker">
    <div class="min-h-screen flex items-center justify-center px-4">
      <div id="sign-in" data-next={props.next} class={`w-full max-w-md ${cardClass} p-8`}>
        <h1 class="text-2xl font-bold mb-2 bg-gradient-to-r from-[#9d4edd] to-[#c77dff] bg-clip-text text-transparent">
          Admin sign-in
        </h1>
        <p class="text-zinc-300 text-sm mb-5">Sign in with an administrator account.</p>
        <form id="password-form" class="flex flex-col gap-1">
          <label for="email" class="text-xs text-zinc-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autocomplete="username webauthn"
            required
            class={`${inputClass} mb-3`}
          />
          <label for="password" class="text-xs text-zinc-300 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autocomplete="current-password"
            required
            class={`${inputClass} mb-4`}
          />
          <button type="submit" class={`w-full ${buttonClass}`}>
            Sign in
          </button>
        </form>
        <form id="totp-form" class="flex flex-col gap-1" hidden>
          <label for="code" class="text-xs text-zinc-300 mb-1">
            Authenticator code
          </label>
          <input
            id="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength={6}
            required
            class={`${inputClass} mb-4`}
          />
          <button type="submit" class={`w-full ${buttonClass}`}>
            Verify
          </button>
        </form>
        <div class="my-4 flex items-center gap-3 text-xs text-zinc-400">
          <span class="h-px flex-1 bg-white/10" />
          or
          <span class="h-px flex-1 bg-white/10" />
        </div>
        <button
          id="passkey"
          type="button"
          class="w-full rounded-md border border-white/15 px-4 py-2.5 font-semibold hover:border-white/40"
        >
          Sign in with a passkey
        </button>
        <div id="status" class="mt-4 text-sm min-h-[1.2em]"></div>
      </div>
    </div>
    {inlineScript}
  </PageLayout>
);
