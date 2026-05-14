---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Favourite tag filters now sync across devices.

**API:** `/api/track/sync` gains an optional `favouriteTags` block in both directions (GET response and POST request/response). Per-row `(tagType, tag, favourited, updatedAt)`; tombstones-in-place (`favourited: false`) propagate unfavourites. Last-write-wins per row on `updatedAt`. Backed by a new `tUserFavouriteTag` table (migration `0008_concerned_snowbird`). The block is additive and optional — older clients are unaffected.

**Native KMP:** favourite tag state moves out of `SettingsStorage` into Room (`FavouriteTagEntity`, DB v5). Toggling a favourite chip in the filter sheet now schedules a debounced (2 s) auto-sync; subsequent syncs LWW-merge per row against the server, so pinned chips reappear on reinstall or a second device. No user-facing UI changes beyond cross-device persistence.
