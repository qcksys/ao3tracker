---
"@qcksys/ao3tracker-native-kmp": patch
---

Keep downloads going when AO3 asks to check that you're not a robot.

When AO3 shows its Cloudflare check, background downloads now wait for it to pass by itself. If it doesn't, they pause instead of failing, and the app tells you in Read, Downloads and a notification. Tap Open on AO3, complete the check, and the downloads continue without using up their retries.
