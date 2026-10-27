---
"@qcksys/ao3tracker-api": patch
---

Detect new chapters sooner by fetching the lighter first-chapter AO3 page, retrying failed refreshes after 30 minutes instead of 6 hours, and refreshing the longest-waiting works first. Restore chapter list updates and stop overlapping refresh runs from fetching the same work twice.
