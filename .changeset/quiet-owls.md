---
"@qcksys/ao3tracker-api": patch
---

Prevent repeated work updates from creating duplicate notification history entries and stop overlapping refreshes from dispatching the same pending alert. Preserve notifications for distinct chapter updates and retry failed deliveries.
