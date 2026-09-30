---
"@qcksys/ao3tracker-browser-extension": minor
---

Works page filter:

- Show a per-tag match count next to each pinned-tag chip. The count reflects the currently filtered list, so toggling any filter (status, favourites, tags, search) refreshes the numbers in place.
- Fix a UI freeze when opening the Works page with a large library. `buildWorksList` previously called `Object.values(chapters).filter(...)` inside the per-work loop, making the join O(works × total chapters). Chapters and tags are now pre-grouped by `workId` in a single pass, and per-row tags are stored as a `ReadonlySet<string>` so include-tag filtering and counting are O(1) per check.
