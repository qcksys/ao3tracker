import type { FC } from "hono/jsx";
import { PageLayout } from "~/views/page-layout";

export const PrivacyPage: FC = () => (
  <PageLayout title="Privacy policy | AO3 Tracker" description="How AO3 Tracker handles your data">
    <main class="mx-auto max-w-3xl px-6 py-12 leading-relaxed">
      <a href="/" class="text-purple-300 hover:underline">
        AO3 Tracker
      </a>
      <h1 class="mt-6 mb-2 text-4xl font-bold">Privacy policy</h1>
      <p class="mb-8 text-zinc-400">Last updated: 2 October 2026</p>
      <div class="space-y-8">
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Scope and purpose</h2>
          <p>
            This policy covers the AO3 Tracker browser extension, AO3 Tracker Beta, native apps and
            their associated account and synchronization service, operated by QckSys. AO3 Tracker
            remembers your reading progress on Archive of Our Own (AO3) and lets you sync it across
            your devices. AO3 Tracker is independent of AO3 and the Organization for Transformative
            Works.
          </p>
        </section>
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Data we handle</h2>
          <ul class="list-disc space-y-3 pl-6">
            <li>
              <strong>Account and authentication:</strong> the name and email address you supply,
              password authentication data and session tokens. Passwords are stored as hashes by the
              authentication service. The extension stores your session token locally to keep you
              signed in. We do not ask for or collect your AO3 password.
            </li>
            <li>
              <strong>Reading data:</strong> AO3 work and chapter identifiers, titles, authors,
              tags, reading timestamps, chapter progress and scroll position, favourites,
              subscriptions, completion status, and the names and URLs of searches you save. The
              service also retrieves AO3 work metadata and downloadable work backups to support
              tracking and update notifications.
            </li>
            <li>
              <strong>Preferences and local storage:</strong> extension settings, cached works,
              synchronization state and notification preferences. Reading data stays in your browser
              until you sign in and synchronize it with the selected service.
            </li>
            <li>
              <strong>Technical information:</strong> IP addresses, browser user-agent information,
              session records and operational logs used to authenticate requests, prevent abuse and
              diagnose service failures. We do not request GPS access.
            </li>
          </ul>
          <p class="mt-4">
            Page tracking is limited to AO3. We do not collect your general browsing history,
            payment details or private communications. Scroll position is used to restore your place
            in a chapter; the extension does not log everything you type.
          </p>
        </section>
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Use and sharing</h2>
          <p>
            We use this data to provide reading tracking, synchronization, saved searches,
            favourites, account security and optional work-update notifications. Data is sent over
            HTTPS to AO3 Tracker's service. Cloudflare provides hosting, storage and transactional
            email delivery; PlanetScale provides database storage. These service providers process
            data as part of operating the service.
          </p>
          <p class="mt-4">
            We do not sell your personal data, use it for advertising, transfer it for purposes
            unrelated to the extension's single purpose, or use it for creditworthiness or lending
            decisions. Transfers are limited to providing and securing the service, complying with
            legal obligations, or with your consent.
          </p>
        </section>
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Native app diagnostics</h2>
          <p>
            Native apps send optional diagnostic data to help us improve reliability: app launches,
            screen names, sync outcomes, reader feature usage and error counts. These events go
            through AO3 Tracker's service to PostHog in the EU. They use a random session identifier
            rather than your account identity and exclude reading content, work IDs, search terms,
            raw error messages, credentials and IP addresses. We do not record reader sessions or
            automatically capture page content or clicks.
          </p>
          <p class="mt-4">
            Crash reports also go through AO3 Tracker's service to PostHog in the EU. They include
            stack traces, exception messages, device information and app versions, using an
            anonymous device identifier. A bounded local disk queue retains crash reports for retry
            after network failures or app restarts.
          </p>
          <p class="mt-4">
            Diagnostic data is enabled by default. Settings → Privacy → Send diagnostic data
            controls new usage and crash collection on this device, and the choice is saved across
            restarts. Incognito mode also pauses new collection. Usage events are kept only in
            memory and discarded when you opt out or close the app. Crash reports collected before
            opting out may still be delivered; opting out does not delete reports already received
            by PostHog.
          </p>
        </section>
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Beta service</h2>
          <p>
            AO3 Tracker Beta connects to dev.ao3tracker.com. Its extension storage and development
            service are separate from the production edition. Development data and features may
            change or be reset during testing. This policy applies to both editions.
          </p>
        </section>
        <section id="contact">
          <h2 class="mb-3 text-2xl font-semibold">Your choices and retention</h2>
          <p>
            You can sign out to stop account synchronization, change notification preferences,
            remove tracked items and saved searches, or uninstall the extension to remove its
            browser storage. Uninstalling does not delete data already synchronized to the service.
            Some item deletions are retained as synchronization markers so other devices can receive
            the deletion. Account, reading and operational data are kept to provide the service and
            maintain its security; this policy does not promise automatic deletion after a fixed
            period.
          </p>
          <p class="mt-4">
            To request access to or deletion of your account and associated data, or to ask a
            privacy question or get help with the app, email{" "}
            <a class="text-purple-300 underline" href="mailto:tom@qcksys.com">
              tom@qcksys.com
            </a>
            . We may need to verify that you control the account before acting on a request.
          </p>
        </section>
        <section>
          <h2 class="mb-3 text-2xl font-semibold">Policy updates</h2>
          <p>
            We will publish updates on this page and change the date above when the policy changes.
          </p>
        </section>
      </div>
    </main>
  </PageLayout>
);
