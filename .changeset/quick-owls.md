---
"@qcksys/ao3tracker-native-kmp": patch
"@qcksys/ao3tracker-core": minor
---

Reduce saved-search checks to recent updates and retain activity counts until the search is opened. Fix a crash when opening the Searches tab.

Start with a small baseline, cap routine checks at ten pages, resume partial results on the next refresh, and pause checks when AO3 limits requests. Offer an explicit full scan for older changes.
