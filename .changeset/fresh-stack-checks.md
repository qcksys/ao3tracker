---
"@qcksys/ao3tracker-api": patch
"@qcksys/ao3tracker-browser-extension": patch
"@qcksys/ao3tracker-native-kmp": patch
"@qcksys/ao3tracker-core": patch
"@qcksys/ao3tracker-sync-client": patch
"ao3tracker-webview-scripts": patch
---

Update application dependencies and resolve compatibility issues in authentication, FCM error handling, AO3 requests, and shared schema validation.

Apply API migration `0012_auth-two-factor-lockout` before deploying the updated API. It adds Better Auth's two-factor verification and lockout fields while retaining existing verified enrollments.
