# modules/polling

`POST /repos/:id/poll` — manual refresh of the PR list from GitHub (upsert by
repo + number, bumps `last_polled_at`).

## Rules
- Polling NEVER triggers a review — reviews are manual only (`reviewTriggered: false`).
