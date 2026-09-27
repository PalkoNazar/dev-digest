# INSIGHTS — server

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `CLAUDE.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

## 2026-09-27 — saving a key needs a cache flush (promoted)
Keys are saved in `POST /settings/test-connection`; LLM/GitHub clients are cached
in the container, so `container.invalidateSecretCaches()` must follow a write.

## 2026-09-27 — `src/prompts` is not copied by `build`
`platform/prompts.ts` reads templates relative to itself; `tsc` doesn't copy `.md`,
so `pnpm build && pnpm start` would miss `dist/prompts`. Dev (`tsx`) is fine.

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
