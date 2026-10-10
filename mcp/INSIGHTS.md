# INSIGHTS — mcp

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

## What Doesn't Work

### 2026-10-10 — `resolvePull` is a write; a read-only tool needs a by-number server route
NEVER resolve a PR through `listPulls` (`GET /repos/:id/pulls`) in a tool meant to be `readOnlyHint: true` — that route upserts PRs from GitHub. Add a side-effect-free `GET /repos/:id/pulls/:number/<thing>` route and call it after `resolveRepo`.
Why: this is why `get_findings` is `readOnlyHint: false`; `get_blast_radius` uses `/repos/:id/pulls/:number/blast` and asserts no `listPulls` call. Evidence: `mcp/src/core/get-blast-radius.ts`, `mcp/test/core-read.test.ts`.

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions
