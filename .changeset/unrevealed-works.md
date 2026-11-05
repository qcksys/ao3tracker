---
"@qcksys/ao3tracker-api": patch
---

Keep unrevealed AO3 works on their normal refresh schedule instead of treating them as failures.

AO3 hides works in an ongoing challenge behind a "Mystery Work" placeholder until they are revealed. Refreshes now recognise that page, keep the work's stored details and check again later, rather than backing off as if the fetch had failed.
