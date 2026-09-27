# INSIGHTS — client

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `CLAUDE.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

## 2026-09-27 — aliases are declared twice
`@/*`, `@devdigest/ui`, `@devdigest/shared` live in `tsconfig.json` AND
`vitest.config.ts`; a new alias added to one only breaks tests or typecheck.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

### 2026-09-27 — vitest can't filter by a path with `[repoId]`/`[number]`
Filter by a folder or file NAME instead: `pnpm exec vitest run FindingsPanel`.
Why: vitest escapes the brackets in a path filter (`[repoId/]`) → "No test files found", exit 1.
Evidence: `pnpm exec vitest run "src/app/repos/\[repoId\]/pulls/..."`.

## Recurring Errors & Fixes

## Session Notes

2026-09-27 — severity count chips + filter in FindingsPanel (+ FindingCard border-stripe fix): 1 entry (vitest bracket paths).

## Open Questions
