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

### 2026-10-11 — a server-derived view goes stale unless every mutation of its inputs invalidates it
ALWAYS invalidate `["agent-context"]` and `["context"]` from any mutation that changes an agent's skill links or a skill's state (`invalidateInheritedContext` in `lib/hooks/skills.ts`).
Why: the server builds the agent Context view from links + skill state; TanStack prefix matching compares whole key elements, so `["agent"]` doesn't cover `["agent-context"]`, and with `staleTime: 30_000` a remounted tab showed old "via skill" rows and tokens. Evidence: `src/lib/hooks/context-invalidation.test.tsx` red before, green after (L05 R3 B1).

### 2026-10-11 — a cache-invalidation test can't use mocked data hooks
Do mock `@/lib/api` with a real QueryClient (not `@/lib/hooks/<domain>`) when a component test must prove a query is re-read.
Why: with mocked hooks an `invalidateQueries` fix is invisible. Evidence: `ProjectContextView.refresh.test.tsx` next to `ProjectContextView.test.tsx` (L05 R3 B2).

## Codebase Patterns

### 2026-10-11 — the UI kit `Checkbox` is named by its `label` and has no `disabled`
Do pass the visible text (e.g. the path span) as `label`; for a pending state wrap it (`pointer-events: none`) and guard the handler.
Why: it renders `<label><button role="checkbox"/>{label}</label>` with no `aria-label`/`disabled` props. Evidence: `src/vendor/ui/kit/Checkbox.tsx`; `ContextDocsPanel.test.tsx`.

### 2026-09-27 — PR-list popovers must portal out of the table card
Render hover cards from a PR row via `createPortal(…, document.body)` with `position: fixed` coords.
Why: `s.tableCard` has `overflow: hidden` (rounded corners) and clips anything absolutely positioned
below the last rows. React events still bubble through the portal to `PRRow`'s onClick (navigates).
Evidence: `src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx`.

### 2026-09-27 — placement rules: frontend-ui-architecture beats react-best-practices
NEVER follow `react-best-practices` → "Code Organization" (`features/`, `utils/`) in the client; use skill `frontend-ui-architecture`.
Why: the client's features are route folders with `_components/`; shared pure logic is `lib/<responsibility>.ts`, no `utils.ts`. Evidence: `.claude/skills/react-best-practices/SKILL.md:167`.

### 2026-09-30 — mutation hooks don't need their own error toast
NEVER add `notify.error` in a `useMutation` `onError` in `lib/hooks/*`; the global `MutationCache.onError` already toasts every mutation failure.
Why: a local call shows two toasts. Queries toast only on status 0 or ≥ 500, so 4xx empty states stay silent. Evidence: `client/src/lib/providers.tsx:35-43`; `lib/hooks/intent.ts` `useDeriveIntent`.

### 2026-10-04 — Smart Diff indicators come from `usePrReviews`, not from `finding_lines`
Do derive diff dots/counters/inline findings from `usePrReviews` + `lib/smart-diff.ts` (`latestReviewsPerAgent`, `countsAsFinding`); use `useSmartDiff` only for grouping.
Why: `["reviews", prId]` is invalidated after a run and after Accept/Dismiss, `["smart-diff", prId]` is not — reading `finding_lines` would show stale counts. The latest-per-agent rule is deliberately mirrored in `server/src/modules/reviews/smart-diff/build.ts`; change both. Evidence: `_components/DiffTab/DiffTab.tsx`.

### 2026-10-10 — counts go inside an ICU plural; keep the number bold with `t.rich`
ALWAYS write counted labels as `{count, plural, one {<b>#</b> x} other {<b>#</b> xs}}` and call `t.rich(key, { count, b: (c) => <strong>{c}</strong> })`; NEVER render `{n} {t("label")}`.
Why: a number outside the message can't be pluralised ("1 endpoints"). Evidence: `client/messages/en/blast.json` `stat.*`, `BlastRadiusCard.tsx` stats row; convention in `messages/en/runs.json`.

### 2026-10-11 — `/onboarding` (add repo) lights up the "onboarding-tour" nav key
NEVER rely on `activeKeyFor` for any path containing `/onboarding` without checking it; the add-repo page matches the tour key.
Why: `activeKeyFor` uses `pathname.includes("/onboarding")`; and `src/vendor/ui/nav.test.ts` pins WORKSPACE order (pulls → context), so inserting a nav item must update it. Evidence: `src/components/app-shell/helpers.ts:29-33`.

### 2026-10-12 — show a polled page's full-page error only when there is no data
ALWAYS gate `ErrorState` on `isError && !data` (or render data first) in views that poll.
Why: TanStack Query v5 keeps `data` but sets `isError` when a background refetch fails, so gating on `isError` swaps a good cached tour for an error screen during a server restart. Evidence: R4 B3 repro in `src/app/repos/[repoId]/tour/_components/OnboardingTourView/OnboardingTourView.test.tsx`.

### 2026-10-12 — reusing another domain's mutation does not refresh this page
Do pass `mutate(arg, { onSettled: () => refetch() })` when a page calls another domain's mutation (e.g. `useRefreshRepo`) whose `onSuccess` doesn't invalidate the page's query; and check `indexing` before `clone_ready` — `clonePath` is set only when the clone job ends.
Why: `useRefreshRepo` invalidates only `["repos"]`/`["pulls", id]`, so the tour stayed on "no local clone" after Resync; during the first clone the page offered a redundant Resync. Evidence: R4 B1/B2 repros, `src/lib/hooks/core.ts:84-87`, `server/src/modules/repos/service.ts:58`.

### 2026-10-12 — resolved: `/onboarding` no longer lights up the tour nav key
The 2026-10-11 entry about `activeKeyFor` matching `includes("/onboarding")` is fixed: it now matches `/^\/repos\/[^/]+\/tour(\/|$)/`, and `nav.test.ts` pins WORKSPACE `["pulls","onboarding-tour","context"]`. Evidence: `src/components/app-shell/helpers.ts:30`, `src/components/app-shell/helpers.test.ts`.

### 2026-10-12 — re-announce the same live-region text with a keyed child
Do render `<span key={seq}>` inside `aria-live` and bump `seq` on every action; setting the same string again is a React no-op, so screen readers hear nothing.
Why: the second identical "Copied" produced no DOM mutation. Evidence: `src/app/repos/[repoId]/tour/_components/RunLocallySection/RunLocallySection.test.tsx` "announces Copied again…".

## Tool & Library Notes

### 2026-09-27 — vitest can't filter by a path with `[repoId]`/`[number]`
Filter by a folder or file NAME instead: `pnpm exec vitest run FindingsPanel`.
Why: vitest escapes the brackets in a path filter (`[repoId/]`) → "No test files found", exit 1.
Evidence: `pnpm exec vitest run "src/app/repos/\[repoId\]/pulls/..."`.

### 2026-09-29 — no `user-event`, no `msw`: component tests use `fireEvent` + mocked `@/lib/hooks`
Use `fireEvent` and `vi.mock("@/lib/hooks/<domain>")` in component tests; don't add `user-event`/`msw` without a plan step.
Why: neither is in `client/package.json`; the generic `react-testing-library` skill (user-event, MSW, "never mock your
own hooks") conflicts — local pattern wins. Evidence: `SkillEditor.test.tsx`, `FindingsCell.test.tsx`.

## Recurring Errors & Fixes

### 2026-09-27 — "Module not found: Can't resolve './contracts/findings.js'" in `next dev`
Fixed by `webpack.resolve.extensionAlias { ".js": [".ts", ".tsx", ".js"] }` in `client/next.config.mjs`.
Why: `vendor/shared` is ESM TS with `.js` suffixes; the first RUNTIME import (a Zod schema, not `import type`)
hits webpack. vitest resolves it, so tests pass while every page 500s — load a page after such an import.

### 2026-09-28 — test fails with the mock's own error, stack in `callCleanupHooks`
NEVER write `beforeEach(() => fn.mockReset())` — use a block body `beforeEach(() => { fn.mockReset(); })`.
Why: `mockReset()` returns the mock, and vitest runs a function returned from `beforeEach` as a cleanup hook,
so it calls the mock after the test (a rejecting mock → the test fails). Evidence: `src/lib/hooks/skills.test.tsx`.

### 2026-09-28 — TanStack Query v5: `setQueryData(key, undefined)` is a no-op
In an optimistic `onError`, restore only a defined `previous` AND `invalidateQueries(key)`.
Why: with nothing cached before `onMutate`, the rollback silently kept the optimistic list.
Evidence: `useSetAgentSkillLinks` in `src/lib/hooks/skills.ts` + its test.

### 2026-09-28 — "TS2593: Cannot find name 'describe'" in `pnpm typecheck`, tests still green
ALWAYS `import { describe, expect, it } from "vitest"` in client test files.
Why: `vitest.config.ts` sets `globals: true`, so `pnpm test` passes, but tsconfig has no `vitest/globals` types, so `tsc --noEmit` fails. Evidence: `src/vendor/ui/nav.test.ts`.

## Session Notes

2026-09-27 — severity count chips + filter in FindingsPanel (+ FindingCard border-stripe fix): 1 entry (vitest bracket paths).
2026-09-27 — PR-list FINDINGS column + hover card: 1 entry (portal out of the table card).
2026-09-27 — skill frontend-ui-architecture v1.0.0 (client placement rules): 1 entry (beats react-best-practices on layout).
2026-09-27 — L02 Skills UI (skills page, editor, import modal, agent Skills tab, trace): 1 entry (shared runtime imports in webpack); +2 in root INSIGHTS.md.
2026-09-28 — L02 review follow-up: useSetAgentSkillLinks test + rollback fix: 2 entries (vitest beforeEach return, setQueryData undefined).
2026-10-04 — Smart Diff Files changed (role groups, inline findings): 1 entry (indicators from usePrReviews).

- 2026-09-28 — moved Agents nav item to SKILLS LAB; added `src/vendor/ui/nav.test.ts` (invariants, not a snapshot).
- 2026-10-12 — SPEC-02 Onboarding Tour R4 (tour page): 3 entries (error gate, cross-domain mutation refresh, /onboarding nav resolved).

## Open Questions
