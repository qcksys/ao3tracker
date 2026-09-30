---
"@qcksys/ao3tracker-native-kmp": minor
---

Filter sheet improvements:

- Add a "Favourites" section at the top of the filter sheet that lists every favourited tag across all tag types. Tapping a chip cycles its filter mode against the underlying per-type filter map; long-press unfavourites.
- Sync favourite-tag toggles to the server immediately instead of debouncing 2s, so the change reaches other devices straight away.
- Fix overlapping tag chips when sections wrap (`FlowRow` `verticalArrangement` was `spacedBy(-8.dp)`; now `spacedBy(8.dp)`).
