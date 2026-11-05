---
"@qcksys/ao3tracker-api": patch
---

Sign out every other session when a password is reset.

Resetting your password now ends all existing sessions and app sign-ins, so anyone holding an old session loses access. The unused session-listing endpoint is disabled, because it returned other sessions' sign-in tokens.
