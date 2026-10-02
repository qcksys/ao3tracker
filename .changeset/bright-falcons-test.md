---
"@qcksys/ao3tracker-api": patch
"@qcksys/ao3tracker-browser-extension": minor
"@qcksys/ao3tracker-native-kmp": minor
---

Add separate Android Dev and Chrome Beta builds that use the development API.

Release the beta clients after successful dev CI and API deployment. The Android Dev app installs alongside production; the Chrome Beta item uses its own store identity and permits only the dev API. Production release behavior remains unchanged.
