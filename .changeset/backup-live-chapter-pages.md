---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Show chapters saved with Download from backup the way AO3 shows them, including in dark mode.

The API now rebuilds each backup chapter in AO3's chapter layout, with the work's tags, summary, notes, chapter titles, end notes and previous/next chapter links, so your AO3 site skin styles it like the live page. Until the app has saved your site skin from AO3, backup chapters use AO3's default skin, switching to AO3's dark Reversi skin when your device is in dark mode. The backup response adds `skins`; the older `styles`, `preface` and `afterword` fields remain for earlier app releases.

Download from backup no longer asks a signed-in reader to sign in when the app was opened without a connection. Copies saved from a backup before this change keep their old layout until you remove the download and download it from the backup again.
