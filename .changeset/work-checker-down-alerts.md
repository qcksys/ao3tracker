---
"@qcksys/ao3tracker-api": minor
---

Email admins when a work checker stops working, and again when it recovers.

While the work checker is enabled, the cron emails every admin account once when a checker has not reported, or has not completed a poll, for two poll intervals plus five minutes. Apply migration `20261125124239_work-checker-down-alert` before deploying.
