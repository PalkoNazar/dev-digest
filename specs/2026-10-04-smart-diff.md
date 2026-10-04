# Smart Diff — reviewer-ordered Files changed with inline findings
Status: draft · Lesson: — (homework after Intent Layer) · Packages: server, client
Plan: specs/plans/2026-10-04-smart-diff.plan.md

## Goal
On a PR's **Files changed** tab, files are grouped by role in a fixed reading order
core → tests → wiring → docs → boilerplate (each group: role label, hint, file count;
docs and boilerplate collapsed on open). The latest agent review is shown in the diff:
the group header counts files with findings (`● N`), a file card with findings carries a
dot next to its path, and the finding card (severity, title, rationale, Accept/Dismiss —
the same `FindingCard` as on Agent runs) sits under the line it points at. A
"Smart order / Original order" switch restores GitHub's order. No LLM call.

## Scope
- In:
  - Pure classifier `classifyFile(path): SmartDiffRole`, patterns + role order in one
    constants file; first matching rule wins (boilerplate → tests → wiring → docs → core).
    Table test "path → role" incl. the disputed cases:
    `__tests__/__snapshots__/x.snap` → boilerplate, `.claude/skills/security/SKILL.md` →
    wiring, `e2e/README.md` → tests (deliberate: the e2e README changes with the suite).
    The classifier imports no Fastify/DB code (L08 reuses it as a pre-prompt filter).
  - Contract: `SmartDiffRole` extended to 5 values in BOTH `brief.ts` copies (identical).
  - `GET /pulls/:id/smart-diff` → `SmartDiff` (response schema `SmartDiffResponse`): files
    from `pr_files`, findings from the latest `kind='review'` review per agent;
    `finding_lines` = sorted unique `start_line`; `split_suggestion` minimal
    (`too_big:false`, `total_lines` = Σ additions+deletions, `proposed_splits: []`).
    Works before the first review (empty `finding_lines`). Workspace-scoped, 404 otherwise.
  - Client: `useSmartDiff`, role groups (sticky header), Smart/Original toggle (default
    smart; falls back to original while loading / on error), indicators and inline
    findings computed from `usePrReviews` (same latest-per-agent selection), dismissed
    findings shown muted but not counted, findings whose line is not in the patch shown
    in a block at the end of the file, the existing Show/Hide comments toggle also hides
    findings (starts shown when findings exist), line marker = left severity stripe +
    right label (CRITICAL → blocker, WARNING → warning, SUGGESTION → suggestion) with
    colors from `SEV`. All strings in `prReview.json → smartDiff` (`testsLabel`,
    `docsLabel`, …). Empty state "review not run yet" instead of zero counters.
- Out: pseudocode summaries, PR split suggestions, LLM-based classification, changes to
  the Agent runs tab, new DB tables/migrations.

## Design
- Server: `server/src/modules/reviews/smart-diff/{constants,classify,build}.ts` (pure),
  `ReviewService.smartDiffForPull`, route in `reviews/routes.ts`.
- Client: `components/diff-viewer` gets an optional `DiffFindingApi` (render-prop
  `renderFinding`, like `DiffCommentApi`) — it cannot import `FindingCard` from
  `app/**/_components`; `DiffTab` passes `FindingCard`. New `DiffTab/RoleGroup`.

## Acceptance criteria
- [ ] Files changed shows the role groups in order core → tests → wiring → docs → boilerplate, each with label and file count.
- [ ] A lock file is in boilerplate; docs and boilerplate start collapsed.
- [ ] After Run review the group header shows the number of files with findings.
- [ ] A file card with findings shows a dot indicator (distinct from the GitHub comment counter).
- [ ] Under the finding's line the finding card shows severity, title and rationale; Accept/Dismiss work.
- [ ] "Original order" restores GitHub's order.
- [ ] Classifier table test incl. the 3 disputed cases; route response passes `SmartDiff` validation; both `brief.ts` copies identical; no LLM call on view.

## Open questions
- none
