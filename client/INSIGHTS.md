# INSIGHTS — client

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
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

### 2026-09-27 — PR-list popovers must portal out of the table card
Render hover cards from a PR row via `createPortal(…, document.body)` with `position: fixed` coords.
Why: `s.tableCard` has `overflow: hidden` (rounded corners) and clips anything absolutely positioned
below the last rows. React events still bubble through the portal to `PRRow`'s onClick (navigates).
Evidence: `src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx`.

### 2026-09-27 — placement rules: frontend-ui-architecture beats react-best-practices
NEVER follow `react-best-practices` → "Code Organization" (`features/`, `utils/`) in the client; use skill `frontend-ui-architecture`.
Why: the client's features are route folders with `_components/`; shared pure logic is `lib/<responsibility>.ts`, no `utils.ts`. Evidence: `.claude/skills/react-best-practices/SKILL.md:167`.

## Tool & Library Notes

### 2026-09-27 — vitest can't filter by a path with `[repoId]`/`[number]`
Filter by a folder or file NAME instead: `pnpm exec vitest run FindingsPanel`.
Why: vitest escapes the brackets in a path filter (`[repoId/]`) → "No test files found", exit 1.
Evidence: `pnpm exec vitest run "src/app/repos/\[repoId\]/pulls/..."`.

## Recurring Errors & Fixes

### 2026-09-27 — "Module not found: Can't resolve './contracts/findings.js'" in `next dev`
Fixed by `webpack.resolve.extensionAlias { ".js": [".ts", ".tsx", ".js"] }` in `client/next.config.mjs`.
Why: `vendor/shared` is ESM TS with `.js` suffixes; the first RUNTIME import (a Zod schema, not `import type`)
hits webpack. vitest resolves it, so tests pass while every page 500s — load a page after such an import.

## Session Notes

2026-09-27 — severity count chips + filter in FindingsPanel (+ FindingCard border-stripe fix): 1 entry (vitest bracket paths).
2026-09-27 — PR-list FINDINGS column + hover card: 1 entry (portal out of the table card).
2026-09-27 — skill frontend-ui-architecture v1.0.0 (client placement rules): 1 entry (beats react-best-practices on layout).
2026-09-27 — L02 Skills UI (skills page, editor, import modal, agent Skills tab, trace): 1 entry (shared runtime imports in webpack); +2 in root INSIGHTS.md.

## Open Questions
