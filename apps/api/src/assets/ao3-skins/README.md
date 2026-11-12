# AO3 site skins

These stylesheets come from [otwcode/otwarchive at 452391b648f2fb06b55c36133812449747634504](https://github.com/otwcode/otwarchive/tree/452391b648f2fb06b55c36133812449747634504/public/stylesheets), retrieved on 2026-11-12. Trailing line whitespace and a final blank line are removed; CSS rules are unchanged. The upstream licence (GPL-2.0) is retained in `LICENSE.txt`.

Files 01–22 and 25–28 are AO3's default site skin under `site/2.0`. Each file's media comes from the `MEDIA:` comment on its first line, as AO3's `Skin.load_site_css` reads it, and defaults to `screen`. `reversi_site_screen_.css` is AO3's official dark skin from `masters/reversi`, which AO3 layers over the default skin. Translator, admin and Internet Explorer files are excluded. The `.txt` suffix keeps the repository formatter from rewriting the source.

`GET /api/backup/{workId}/offline` sends these with every backup as the saved chapters' skin, with Reversi limited to `prefers-color-scheme: dark`. The native reader uses them only while no AO3 site skin has been captured for the reader's AO3 account. The same files are the Android rendering fixtures in `apps/native-kmp/composeApp/src/androidDeviceTest/assets/ao3-skins`; update both together.
