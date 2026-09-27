# modules/pulls

PR list and detail (synced from GitHub via Octokit) + GitHub review comments.

## Gotchas
- Local-first: reads sync from GitHub when a token exists but NEVER fail without one —
  seeded/imported PRs stay viewable offline. Writes (post comment) do fail with a 400.
- DB `status` is GitHub's merge state; the review status (needs_review / reviewed /
  stale) is DERIVED in `status.ts` from `lastReviewedSha` vs head + `STALE_DAYS`.
- Routes-only module (Drizzle inside handlers) — don't copy this shape.
