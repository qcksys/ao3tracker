---
"@qcksys/ao3tracker-api": patch
"@qcksys/ao3tracker-native-kmp": patch
---

Fix native passkey registration and sign-in by preserving challenge cookies, sending credential responses as JSON objects, and retaining the selected API environment throughout authentication.

Validate Android passkeys against configured signing-certificate origins and keep those certificates aligned with Digital Asset Links, including the separate development app. Deploy the API update before releasing the native client.
