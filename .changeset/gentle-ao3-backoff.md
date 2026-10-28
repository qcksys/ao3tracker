---
"@qcksys/ao3tracker-api": patch
---

Reduce load on AO3 while it is failing: stop each refresh run at the first AO3 server error or timeout, fetch one work at a time, and back off failed works from 30 minutes up to the normal 6 hours.
