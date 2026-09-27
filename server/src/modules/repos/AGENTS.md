# modules/repos

Add / list / refresh / delete repositories. Adding a repo enqueues a `clone` job;
on success the clone job ENQUEUES (does not await) the repo-intel index job.

## Gotchas
- Clones land in `DEVDIGEST_CLONE_DIR` (default `./clones`, git-ignored).
- An index-follow-up failure must not fail the clone job — the repo stays usable
  and the user can resync.
