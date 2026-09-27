# INSIGHTS — server

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
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

### 2026-09-27 — listing "core" files by name leaves holes in dependency-cruiser rules
NEVER define the module core as a filename allowlist (`service|helpers|…`); define it as `modules/**` minus `routes.ts` minus `repository*`.
Why: the allowlist silently skipped `repo-intel/pipeline/*`, which imports `Container`. Evidence: `MODULE_CORE` in `.dependency-cruiser.cjs`.

### 2026-09-27 — `withTimeout` does not cancel the work it times out
NEVER treat a `withTimeout` rejection as "the operation stopped"; the wrapped promise keeps running.
Why: it is a bare `Promise.race` (`src/platform/resilience.ts:20`), so a JobRunner retry (`src/platform/jobs.ts:65`)
can run concurrently with the timed-out attempt (e.g. two clones into one dir). Needs an AbortSignal to really stop.

## Codebase Patterns

## Tool & Library Notes

### 2026-09-27 — dependency-cruiser `exclude: '(^|/)dist/'` hides pnpm packages
NEVER exclude `dist/` by an unanchored pattern in `.dependency-cruiser.cjs`; cruising `src` is enough.
Why: pnpm resolves to `node_modules/.pnpm/<pkg>/…/dist/index.js`, so the exclude silently dropped p-queue/graphology edges and SDK rules never fired.

### 2026-09-27 — match banned packages as `(^|node_modules/)pkg(/|$)`
Do write package rules so they also match unresolved bare imports.
Why: reviewer-core has no `drizzle-orm` in its own `node_modules`, so the edge is `drizzle-orm` (unresolved), not `node_modules/drizzle-orm/`. Evidence: rule `reviewer-core-is-pure`.

## Recurring Errors & Fixes

### 2026-09-27 — "has an unsafe regular expression. Bailing out."
dependency-cruiser's safe-regex check rejects nested quantifiers like `^src/modules/[^/]+/(.+/)?x`.
Fix: use `.*` instead (`^src/modules/.*/x`), or a `{ path, pathNot }` pair.

## Session Notes

2026-09-27 — onion-architecture skill + dependency-cruiser rules (`pnpm arch:check`, 41-violation baseline): 4 entries.
2026-09-27 — whole-project review → docs/improvement-plan.md: 1 entry (withTimeout doesn't cancel).

## Open Questions
