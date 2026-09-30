---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-core": minor
"@qcksys/ao3tracker-sync-client": minor
"@qcksys/ao3tracker-browser-extension": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Add saved searches: name and save an AO3 filter/search URL from a "Save this search" button injected on AO3 list pages, then open, rename, or delete them later. Saved searches sync across devices via `/api/track/sync` (new optional `savedSearches` array, per-row LWW keyed by a client-generated uuid, tombstone deletes) backed by a new `user_saved_search` table.

- **Browser extension**: on-page save button + a new "Searches" popup tab to open/rename/delete.
- **Native (KMP)**: on-page save button in the WebView with a naming dialog (Read tab), and a saved-searches bottom sheet to open/rename/delete (Track tab); new `saved_search` Room table (DB v6) + repository + sync wiring.

Fix cross-device synchronization and local data safety:

- Isolate each account and API environment, preserving its local data and pending edits when switching accounts (native Room DB v7).
- Preserve edits made during GET/POST requests, acknowledge only uploaded versions, merge partial tag metadata, and retain the first pagination watermark.
- Use server mutation timestamps with bounded replay for incremental sync, atomic last-write-wins updates, and persistent deletion tombstones. Apply API migration `0011_sync-mutation-cursors` before deploying the new server.
- Preserve native deletions during metadata refresh, synchronize mark-unread resets, use server values on timestamp ties, and clear local data only after a successful sync with no intervening edits.
- Report the chapter identified in the page DOM when tracking scroll progress on a work's root URL.
