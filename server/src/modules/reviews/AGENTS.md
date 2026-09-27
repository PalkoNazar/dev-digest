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
- `repository.ts` is a facade over `repository/{review,run,pull}.repo.ts` — add
  queries in the split files, keep the facade API stable.

## Related
- Engine: `/reviewer-core/AGENTS.md` · prompt conventions: `/docs/agent-prompts/README.md`
- repo-intel facade: `../repo-intel/README.md`
