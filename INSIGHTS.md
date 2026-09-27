# INSIGHTS — cross-package

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `CLAUDE.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

## 2026-09-27 — `@devdigest/shared` copies have drifted (promoted)
`server/src/vendor/shared` vs `client/src/vendor/shared` differ in `adapters.ts`,
`contracts/{trace,eval-ci,knowledge,productionize}.ts`; the client `LLMProvider.id`
has no `'openrouter'`. Check: `diff -r server/src/vendor/shared client/src/vendor/shared`.

## 2026-09-27 — reviewer-core deps are a server prerequisite (promoted)
reviewer-core pins `zod` to its own `node_modules`; without `npm ci` there the
server fails to boot. `scripts/dev.sh` installs it since commit 66727c8.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
