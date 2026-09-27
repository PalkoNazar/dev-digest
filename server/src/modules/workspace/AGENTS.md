# modules/workspace

`GET /workspace` — workspace id, clone dir and a summary of cloned repos (read-only).
Repo cleanup/refresh belongs to `modules/repos`, not here.

## Gotchas
- Single-tenant MVP: `LocalNoAuthProvider` always returns the default workspace.
