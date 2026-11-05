---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Download a tracked work for offline reading from its latest backup, even while AO3 is down.

Work Details, Downloads and the reader's offline menu have a Download from backup action for signed-in readers. It saves every chapter of the work's latest HTML backup from the tracker server without loading AO3, and the chapters open in the offline reader like other saved chapters. Backup copies have no author work skin or images. The API adds `GET /api/backup/{workId}/offline`, which returns the backup's sanitized chapters labelled with their AO3 chapter IDs.
