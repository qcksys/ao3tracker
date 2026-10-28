---
"@qcksys/ao3tracker-api": minor
"@qcksys/ao3tracker-core": minor
"@qcksys/ao3tracker-work-checker": minor
---

Check AO3 works from a self-hosted browser so work updates keep arriving when AO3 blocks the server.

A new Docker container runs Google Chrome, polls the API for works to check, and posts the pages and backup downloads back. The API applies them exactly as its own refresh does. Each API release publishes the container image, which deploys automatically on the self-hosted server. The development API hands its AO3 checks to the container; production keeps fetching from the Worker until `WORK_CHECKER_SETTINGS.enabled` is turned on.
