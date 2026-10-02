---
"@qcksys/ao3tracker-native-kmp": patch
"@qcksys/ao3tracker-api": patch
---

Replace Sentry with PostHog crash reporting through AO3 Tracker’s API. Retain pending crash reports across network failures and app restarts, attach app versions and readable Android release mappings, and respect the diagnostic collection setting. Fix delivery of crash reports and diagnostic events through the API proxy.
