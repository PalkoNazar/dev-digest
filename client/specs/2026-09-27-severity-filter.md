# Severity counters + filter on PR findings
Status: done · Lesson: — · Packages: client

## Goal
Each review run on the PR page shows how many findings it has per severity
("Critical 3 · Warning 5 · Suggestion 2"); clicking a level shows only that level's findings.

## Scope
- In: count chips in the `FindingsPanel` toolbar of every review run; single-level filter.
- Out: the design's "All categories" chip; a page-wide (cross-run) counter; persisting the
  filter in the URL; server/contract changes (`Severity` already is the 3-level enum).

## Design
Source: `DevDigest Design (standalone).html` → `FindingsPanel` (chips, divider, then
"Hide low confidence" on the right).

- `FindingsPanel/constants.ts` — `SEVERITY_LEVELS` (chip order).
- `FindingsPanel/helpers.ts` — `countBySeverity(findings)`;
  `visibleFindings(findings, hideLow, severity)` gains the level filter.
- `FindingsPanel.tsx` — `Chip` + `SEV` from `@devdigest/ui` (icon, colour, count, `active`);
  local `sevFilter: Severity | null`; filter change resets j/k focus to the first card.
- i18n: `prReview.panel.severity.{CRITICAL,WARNING,SUGGESTION}`.
- Deliberate deviation from the mock: the mock toggles each level independently; the
  request was "click a level → only its findings", so it is a solo filter (click again = all).

## Acceptance criteria
- [x] Three chips per run with counts of ALL the run's findings (0 shown), unaffected by
      "Hide low confidence" or the active filter.
- [x] Click a level → only its findings; click it again → all; another level → switches.
- [x] Severity filter combines with "Hide low confidence"; empty result → "No findings match".
- [x] j/k/a/d act on the filtered list (focus resets on filter change).
- [x] Unit (`helpers.test.ts`) + RTL (`FindingsPanel.test.tsx`) tests; client typecheck passes.

## Open questions
- Should the design's multi-toggle behaviour replace the solo filter?
