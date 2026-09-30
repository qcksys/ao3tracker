---
"@qcksys/ao3tracker-browser-extension": patch
---

Fix sync silently dropping pending works when the user has more than 50 changed since the last sync. `runSync` now batches through every pending work in chunks of 50 (matching the api's per-request limit and the native KMP client's behaviour) instead of pushing only the first batch and leaving the rest stuck with `pendingSync = true`.
