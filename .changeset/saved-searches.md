---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-core": minor
"@qcksys/ao3tracker-sync-client": minor
"@qcksys/ao3tracker-browser-extension": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Add saved searches: name and save an AO3 filter/search URL from a "Save this search" button injected on AO3 list pages, then open, rename, or delete them later. Saved searches sync across devices via `/api/track/sync` (new optional `savedSearches` array, per-row LWW keyed by a client-generated uuid, tombstone deletes) backed by a new `user_saved_search` table.

- **Browser extension**: on-page save button and a "Searches" popup tab to open/rename/delete. Both clients show "Saved search" when viewing saved filters, including subsequent result pages. Suggested names list the applied filters, excluding pagination and current results, and remain editable.
- **Both clients**: add Hide work/Unhide controls to AO3 lists and device-local search preferences in Settings. Default hidden tags start empty and are merged into every AO3 work/bookmark search; Settings also restores hidden works.
- **Native (KMP)**: on-page save button in the WebView with a naming dialog (Read tab), and a saved-searches bottom sheet to open/rename/delete (Track tab); new `saved_search` Room table (DB v6) + repository + sync wiring.

Fix cross-device synchronization and local data safety:

- Isolate each account and API environment, preserving its local data and pending edits when switching accounts. Native Room DB v8 stores each account and guest in a separate database file and migrates existing data automatically.
- Add a native Settings action to copy guest works, progress, favourite tags and saved searches into the signed-in account. Preserve existing account entries and the guest library, and keep imported data ready for sync. Signing out keeps local account data for the next sign-in.
- Preserve edits made during GET/POST requests, acknowledge only uploaded versions, merge partial tag metadata, and retain the first pagination watermark.
- Use server mutation timestamps with bounded replay for incremental sync, atomic last-write-wins updates, and persistent deletion tombstones. Apply API migration `0011_sync-mutation-cursors` before deploying the new server.
- Preserve native deletions during metadata refresh and when another device's clock is ahead, synchronize mark-unread resets, use server values on timestamp ties, and clear local data only after a successful sync with no intervening edits.
- Report the chapter identified in the page DOM when tracking scroll progress on a work's root URL.
- Restore a deleted extension work when reading resumes, while retaining deletion for flag-only edits.
- Batch native favourite tags and saved searches at the API's 500-row limit, including uploads containing only those collections.
- Preserve chapter-zero tombstones when single-chapter works gain real chapter IDs, and reconcile later legacy uploads without duplicating progress.
