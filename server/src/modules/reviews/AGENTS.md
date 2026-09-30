# modules/reviews

Runs agent reviews on a PR and owns findings, runs and traces.
Flow: `routes.ts` → `service.ts` (public surface) → `run-executor.ts` (all I/O around
the engine) → `reviewPullRequest()` from reviewer-core.

## Gotchas
- `POST /pulls/:id/review` returns runIds immediately; `executeRuns` is NOT awaited.
  Progress streams over SSE (`/runs/:id/events`, rate limit off).
- Every exit path of a run (done / failed / cancelled / pre-work failure) MUST call
  `completeAgentRun` + `saveRunTrace` + `runBus.complete`, or the UI hangs on "running".
- repo-intel enrichment (callers, repo map, rank note) is best-effort: on error log a
  Live Log line and continue — it never fails a run.
- `score` and `blockers` are deterministic (`countBlockers` vs `agent.ciFailOn`);
  never trust the model's self-reported verdict/score.
- `repository.ts` is a facade over `repository/{review,run,pull,intent}.repo.ts` — add
  queries in the split files, keep the facade API stable.
- Intent layer (`intent/`, spec `specs/2026-09-29-intent-layer.md`): `executeRuns`
  derives the PR intent once before the agents (`IntentService.derive`, the
  `review_intent` feature model). It never fails a run: classifier error / no key /
  timeout → a low-confidence fallback; any other error → reviews run without intent.
  Cached per PR by `input_hash` (title, body, branch, head SHA, prompt version) + the
  model; fallback records are recomputed every run. `POST /pulls/:id/intent` forces it.
- The classifier gets files + hunk headers only (`summarizeDiff`), never a diff body.
  Live Log / pino lines carry counts, sizes, refs and paths — never body, issue, doc or
  diff text; provider errors go through `redactSecrets`.
- The out-of-scope filter runs in reviewer-core after grounding (`scopeMode` from
  `scopeModeFor`: `enforce` for a medium/high llm intent, else `tag`), so
  `outcome.review.findings`, `score` and `blockers` are already post-filter.

## Related
- Engine: `/reviewer-core/AGENTS.md` · prompt conventions: `/docs/agent-prompts/README.md`
- repo-intel facade: `../repo-intel/README.md`
