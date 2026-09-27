# Worked examples: DevDigest client

Real files from `client/src`, used as reference points for the rules in `SKILL.md`.
Paths are relative to `client/src/`. Checked against the repo on 2026-09-27 (skill v1.0.0).

## Contents
1. Placements to copy
2. Known deviations (fix them when you touch the file)
3. Walkthroughs: "where does this go?"

---

## 1. Placements to copy

**A component folder with every optional file**
`app/repos/[repoId]/pulls/_components/FindingsCell/`
- `FindingsCell.tsx` holds the rendering, event wiring and data hook (`usePrReviews`).
- `constants.ts` holds `LEVELS` (severity order) and the hover-card geometry `CARD_WIDTH`, `CLOSE_DELAY_MS`, each with a doc comment for its unit.
- `helpers.ts` holds pure functions (`findingHref`, `totalFindings`, `latestReview`, `cardPosition`). They are testable without React, and `cardPosition` takes the viewport as an argument rather than reading `window`.
- `styles.ts` exports `s`, with static entries `satisfies CSSProperties` and dynamic entries written as functions (`card(pos)`).
- `index.ts` is a single `export { FindingsCell } from "./FindingsCell";`.

**Nested private children**
`app/agents/[id]/_components/AgentEditor/_components/ConfigTab/`
`ConfigTab` is used only by `AgentEditor`, so it lives inside the editor's folder rather than next to it.

**Layout atoms in one file**
`app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/atoms.tsx`
`Stat` and `Row` are trivial presentational helpers with no logic. They are grouped in one file and never tested alone.

**Route-wide constants and helpers**
`app/repos/[repoId]/pulls/constants.ts` (`STATUS_META`, `GRID`, the size thresholds) and
`app/repos/[repoId]/pulls/helpers.ts` (`sizeOf`, `relativeTime`) serve the page, `PRRow` and `FilterBar` of that route.

**Shared app component with an explicit public surface**
`components/diff-viewer/index.ts` exports only `DiffViewer` and `type DiffCommentApi`. Inner parts (`CodeLine`, `FileCard`, `InlineComposer`) stay private to the folder.

**UI hooks for a shared component**
`components/app-shell/hooks/`: `useGlobalShortcuts`, `useShellCommands`, `useShellContext`.
These hooks hold UI behaviour only and make no server calls.

**Data layer**
`lib/hooks/reviews.ts`: `usePrActiveRuns`, `usePrRuns`, `usePrReviews`, `useDeleteRun`…
Each hook keeps its query key, its `queryFn` over `api.get`, its polling (`refetchInterval`) and the related types (`ActiveRun`) in one file. `lib/hooks/index.ts` re-exports every domain file.

**Shared pure logic named by responsibility**
- `lib/github-urls.ts` builds github.com deep links (`githubPrUrl`, …).
- `lib/model-label.ts` formats model-picker labels. It is used by `ConfigTab` (agents) and `SettingsModels` (settings), which is two routes, so it lives in `lib/`.
- `components/run-cost-badge/helpers.ts` holds `formatUsd`. It stays with the component that owns the formatting, and other code imports it through the component's folder.

**Thin pages**
`app/agents/page.tsx`, `app/onboarding/page.tsx` and `app/settings/[section]/page.tsx` are each under 10 lines and only render a `_components/<Name>View`.

## 2. Known deviations (fix them when you touch the file)

| Where | What | Fix |
|---|---|---|
| `app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx` | Imports `sortBySeverity` and `lineLabel` from **another route's** `_components/` (`pulls/[number]/_components/FindingsPanel/helpers`, `FindingCard/helpers`). | Two routes use them, so promote both to `lib/findings.ts` (named by responsibility), move their tests, and update both routes' imports. |
| `app/repos/[repoId]/pulls/page.tsx` | Filtering, sorting and URL-state logic sit in the page itself. | Move it into a `_components/PullsView` plus the route's `helpers.ts` (`filterPulls`, `sortPulls`). |
| `app/repos/[repoId]/pulls/[number]/page.tsx` (188 lines) | A fat client page that holds tabs, runs and cancel logic. | Don't grow it. New logic goes to `_components/`, and extract a `PrDetailView` when you next touch the page. |
| `app/repos/[repoId]/pulls/[number]/page.tsx`, `_components/RunReviewDropdown/RunReviewDropdown.tsx`, `pulls/constants.ts` | Deep relative imports (`../../../../../lib/hooks`). | Switch to `@/lib/hooks`, `@/components/app-shell` and `@/lib/types`. |

## 3. Walkthroughs: "where does this go?"

**"Add a category filter (bug / security / perf…) next to the severity chips in the Findings tab."**
Only `FindingsPanel` uses it. It already renders severity chips inline, and a second chip row gives the panel a second job, so extract `FindingsPanel/_components/CategoryFilter/`. Put the predicate next to the severity one in `FindingsPanel/helpers.ts`, with a case in `helpers.test.ts`. The selection is UI state, so hold it in `useState` in `FindingsPanel`, or in `?cat=` if it should survive a reload. Chip labels come from `CAT` in `@devdigest/ui` and `messages/en/prReview.json`, not hard-coded strings.

**"Show the run cost on the agent page too."**
`RunCostBadge` is already in `src/components/run-cost-badge/`, so import it from `@/components/run-cost-badge`. Do not copy it into the agents route.

**"We need to call `GET /agents/:id/stats`."**
Add `useAgentStats(id)` to `lib/hooks/agents.ts`, with its query key next to the other agent keys. Add the response type to `@devdigest/shared` (server copy first). The component calls the hook and never calls `api.get`.

**"Format a duration as `1m 23s` in the trace drawer."**
While only the drawer needs it, it goes in `RunTraceDrawer/helpers.ts`. When the PR list also needs it, move it to `lib/format-duration.ts` and delete the old copy. Don't create `lib/utils.ts` for it.

**"A new generic `Tooltip` for everything."**
A tooltip has no domain knowledge, so it belongs to the design system. Put it in `vendor/ui/kit/Tooltip.tsx`, export it from `vendor/ui/index.ts`, add it to the showcase, and import it from `@devdigest/ui`.

**"`AgentCard` needs a colour map for agent status that `AgentEditor` also uses."**
`AgentCard` is in `app/agents/_components/` and `AgentEditor` is in `app/agents/[id]/_components/`. These are two route folders, but one is nested under the other, so the nearest common owner is `app/agents/`. Put the map in `app/agents/constants.ts`. Promote it to `lib/` only when a route outside `agents/` needs it.
