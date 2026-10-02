---
"@qcksys/ao3tracker-api": patch
---

Retry temporary AO3 TLS handshake failures before deferring work update checks, reducing missed or delayed notifications. Preserve deleted-work detection when the HTTP client has already consumed the error response.
