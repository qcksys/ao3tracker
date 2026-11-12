# AO3 skin acceptance fixtures

These stylesheets come from [otwcode/otwarchive at 9dd99008f52ccc726978db131181421f4eb38fe5](https://github.com/otwcode/otwarchive/tree/9dd99008f52ccc726978db131181421f4eb38fe5/public/stylesheets), retrieved on 2026-10-03. Trailing line whitespace and a final blank line are removed; CSS rules are unchanged. The upstream licence is retained in `LICENSE.txt`.

Files 01–22 and 25–28 are the default site rules under `site/2.0`. Their media attributes follow the source filenames: midsize, narrow, speech, and print. Reversi is the screen stylesheet from `masters/reversi`. Admin, translator, and obsolete Internet Explorer rules are excluded. The `.txt` suffix preserves the source bytes from repository formatting.

The API serves the same files as the skin of backup chapters, from `apps/api/src/assets/ao3-skins` (checked identical to otwarchive `452391b648f2fb06b55c36133812449747634504` on 2026-11-12); update both together.

Android instrumentation loads these assets through an intercepted AO3 fixture URL, captures them through the real native bridge, closes and reopens the content database, and compares computed typography, colours, spacing, borders, and chapter width with the saved reader. The story text and logged-in identity are synthetic. No AO3 account, private work, or network connection is needed. Custom inherited and replacement skins are tested alongside these upstream styles.
