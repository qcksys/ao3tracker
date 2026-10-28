---
"@qcksys/ao3tracker-api": patch
---

Stop saving "Unknown" titles and zero chapter counts when AO3 serves a maintenance or other non-work page.

Scheduled fetches now treat a successful response without a work title or chapter count as a failed fetch and retry it later, instead of overwriting the work's metadata.
