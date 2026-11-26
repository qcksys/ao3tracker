# @qcksys/ao3tracker-work-checker

## 0.1.0

### Minor Changes

- b94046f: Add an admin dashboard and settings page to the website.

  Administrators sign in at `/admin` with their password (and authenticator code) or a passkey. The dashboard shows users, tracked works, refresh health, notifications, backups and the browser work checker's latest status, which the checker now reports after every poll. The settings page turns the work checker on or off and tunes its polling without a deployment.

- cfdb574: Check AO3 works from a self-hosted browser so work updates keep arriving when AO3 blocks the server.

  A new Docker container runs Google Chrome, polls the API for works to check, and posts the pages and backup downloads back. The API applies them exactly as its own refresh does. Each API release publishes the container image, which deploys automatically on the self-hosted server. The development API hands its AO3 checks to the container; production keeps fetching from the Worker until its `work_checker` setting is enabled in the database.

### Patch Changes

- Updated dependencies [b94046f]
- Updated dependencies [cfdb574]
  - @qcksys/ao3tracker-core@0.4.0
