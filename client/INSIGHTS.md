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
