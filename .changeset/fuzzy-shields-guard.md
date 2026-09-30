---
"@qcksys/ao3tracker-browser-extension": patch
---

Harden extension: HTTPS-only content match, sender-origin validation, API base-URL allow-listing, and prod build surface reduction.

- Content script now matches only `https://archiveofourown.org/*` (was `*://*.archiveofourown.org/*`), dropping `http://` and subdomains.
- Background message listener rejects messages whose `sender.id` is not this extension, and requires content-script messages to originate from an AO3 host (blocks a malicious iframe embedded on an AO3 page from posting valid-shaped `pageEvent` payloads).
- The stored API base URL is validated against the build's preset allow-list (`resolveApiBaseUrl`) before any fetch/auth client uses it, so a tampered value can't redirect the bearer token to an attacker origin.
- Production builds ship only the real API endpoints (prod + dev) in both the Settings dropdown and `host_permissions`; the `proxy`/`local` dev conveniences are stripped from release builds.
- Establish a stable unpublished Chrome identity and Firefox add-on identity, with a fixed runtime UUID for Firefox development profiles. The API trusts these exact development origins without a wildcard.
