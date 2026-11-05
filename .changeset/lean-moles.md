---
"@qcksys/ao3tracker-api": patch
---

Speed up sync and work refreshes by indexing chapter and tag lookups by work.

Sync, tag replacement and moving single-chapter reading progress to real chapter IDs no longer scan whole tables. Two redundant indexes are dropped. Migration `20261029184713_db-insights-indexes` only adds and drops indexes, so it is compatible with the currently deployed API.
