# FINDINGS column on the PR list
Status: done · Lesson: — · Packages: server, client

## Goal
The Pull Requests list shows, per PR, how many findings its latest review has per
severity (e.g. "⊘ 7 ⚠ 3"); hovering the counts opens a card listing those findings
(severity, title, category, file:lines, confidence, rationale). Follow-up to the
per-run severity chips (`client/specs/2026-09-27-severity-filter.md`).

## Scope
- In: `findings_count` on `PrMeta` (list endpoint); FINDINGS column between SCORE and
  STATUS; lazy hover card.
- Out: filtering/sorting the list by findings; accept/dismiss from the card; excluding
  dismissed findings (counts match the run's chips on the PR page, which count all).

## Design
- Contract: `SeverityCounts {critical, warning, suggestion}` + `PrMeta.findings_count`
  (nullish) — both `@devdigest/shared` copies.
- Server `GET /repos/:id/pulls`: counts come from the SAME review as `score` (latest
  `kind='review'` row), so the ring and the breakdown never disagree. One extra
  IN-query on `findings` for those review ids, tallied with the existing
  `rollupSeverities` (`server/src/modules/pulls/status.ts`). Not the "round" used by
  COST: pre-L01 runs have no `head_sha`, so a round match would hide their findings.
- Index `findings_review_id_idx` (migration 0012) backs that IN-query — the FK alone
  gave no index, so it was a seq scan over all findings.
- Client `pulls/_components/FindingsCell`: `—` never reviewed · `0` clean review ·
  icon + count per non-zero level. Hover → card portalled to `body` with fixed
  coordinates (the table card has `overflow: hidden`); flips above near the viewport
  bottom. Findings are fetched on first hover via `usePrReviews`, the latest review is
  picked client-side by the same rule, sorted with `sortBySeverity`.
- Deep link: `?finding=<id>` on the PR page → `FindingsTab` → `ReviewRunAccordion`
  (opens if it holds the id) → `FindingsPanel` (focus + expand + `scrollIntoView`).
- i18n: `prReview.list.columns.findings`, `prReview.list.findings.{title,empty,error}`.

## Acceptance criteria
- [x] Never reviewed → `—`; reviewed with no findings → `0`; else non-zero levels only.
- [x] Counts = latest review only (older reviews and `summary` rows ignored).
- [x] Hover shows "N findings" card with the latest review's findings, most severe first.
- [x] Each finding in the card links to `<pr>?tab=findings&finding=<id>`: the PR page opens
      the run holding it, expands + focuses that finding and scrolls it into view (once;
      an unknown id is ignored). Clicks elsewhere in the card don't open the PR.
- [x] Keyboard: the counts are a focusable `role=button` (`aria-expanded`/`aria-controls`);
      focus or Enter/Space opens the card, Escape/blur closes it.
- [x] Integration test (`reviews.it.test.ts`), RTL + helper tests (`FindingsCell.test.tsx`);
      server + client typecheck.
