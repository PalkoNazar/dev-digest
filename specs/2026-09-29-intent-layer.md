# Intent Layer — derive a PR's intent before review
Status: draft · Lesson: — (non-course) · Packages: server, reviewer-core, client
Plan: specs/plans/2026-09-29-intent-layer.plan.md

## Goal
Before a review, a separate cheap model (Settings → Feature Models → "PR Review · Intent",
default OpenRouter `deepseek/deepseek-v4-flash`) derives the PR's intent — `summary`,
`in_scope[]`, `out_of_scope[]` — from the title, body, linked issue/ticket, linked plan/spec
docs and the list of changed files with hunk headers (never change bodies). The intent is stored
per PR, shown on the PR page before review results so the user can check the task was understood,
passed to every reviewer as structured untrusted context, and used to filter out-of-scope
findings (keeping one signal for a serious one).

## Scope
- In:
  - Sources: title, body, closing-linked issues (GraphQL) + issues mentioned in the body, plan/spec
    docs linked in the body read at the PR head SHA (local clone, then GitHub contents API), branch
    name, files `(+adds −dels)` with ≤5 hunk headers each (≤100 files).
  - Unreachable links (404, too large, other repo, Linear/Jira/Notion without credentials) are
    listed as unresolved and set `missing_context`; the classifier is told to state missing
    context, never to guess.
  - Confidence low/medium/high from evidence (resolved ticket/spec > descriptive body > title,
    branch, files); the model can only lower it. Fallback (no key, error, timeout) = low; the
    review always runs.
  - Stored per PR (`pr_intent`), cached by title/body/branch/head SHA/model; "Recompute" on demand.
  - Review prompt: `## Derived PR intent` (untrusted block) + a trusted instruction to tag each
    finding `scope: in|out`. After citation grounding (unchanged): medium/high confidence → drop
    out-of-scope findings except the single most severe one ≥ WARNING (kept, badged "Outside PR
    scope"); low/fallback → tag only. Security leaks / lethal trifecta / security findings at WARNING or
    higher are never dropped. Score and blockers use the post-filter set; filtered findings stay in the trace.
  - UI: INTENT card on PR Overview (summary, IN SCOPE ✓, OUT OF SCOPE ✗, confidence, sources,
    "context missing" notice, Derive/Recompute, stale badge); compact intent line on the Findings
    tab above the review runs; finding badge "Outside PR scope"; intent block in the run trace.
  - Observability: per-component prompt size + token estimate (chars/4), model, sources; two
    visible LLM calls per review — `intent-classifier` and `review`; no secrets, no PR/issue/doc
    text, no diff content in logs.
- Out: risk areas / Risks brief, blast radius, PR history, commit messages as input, tracker
  integrations, auto-derive on import, intent cost in run cost, CI runner.

## Design
- Contracts (`@devdigest/shared`, both copies): `Intent {summary, in_scope, out_of_scope}`,
  `PrIntentRecord` (+ confidence, mode, missing_context, context_gaps, sources_used,
  unresolved_refs, prompt_components, model/cost, fallback_reason, head_sha, updated_at),
  `PrIntentResponse {intent|null, stale}`, `Finding.scope?`, `PromptAssembly.intent?`,
  `DiffHunk.header?`, ports `linkedIssueNumbers`, `getFileAtRef`, `showFile`.
- Routes: `GET /pulls/:id/intent`, `POST /pulls/:id/intent` (recompute).
- Tables: `pr_intent` + provenance/observability columns; `findings.scope`.
- Engine: `reviewer-core` `applyScopeFilter` (pure) after `groundFindings`, before scoring.

## Acceptance criteria
- [ ] The card describes the PR goal correctly on a PR with a linked issue + spec.
- [ ] The classifier runs on the separate cheap model; the review on the agent's model; both calls
      appear in the Live Log with model and token estimate.
- [ ] The classifier request contains file names and hunk headers but no diff body lines.
- [ ] A linked plan/spec is fetched and listed as a source; a broken link shows "context missing".
- [ ] Empty body → intent from title, file names and hunk headers, confidence low.
- [ ] Medium/high confidence: out-of-scope findings filtered, one serious one kept and badged;
      low confidence: tagged only. Grounding and the injection guard unchanged.
- [ ] Logs/traces contain no secrets and no PR/issue/doc/diff text.
- [ ] A failing or key-less classifier never fails the review.

## Open questions
- Resolved 2026-09-30: exempt from the scope filter — every CRITICAL, `secret_leak`,
  `lethal_trifecta`, and any `security` finding at WARNING or higher; the signal comes only
  from the rest.
- Resolved 2026-09-30: linked docs are read only from the repo root or a plan/spec folder
  (`specs/`, `docs/`, `plans/`, `adr/`, `rfcs/`, `design/`…); `.txt` is not a doc.
- Resolved 2026-09-30: issues and docs in another repo are recorded as unresolved
  `external_repo`, never fetched.
