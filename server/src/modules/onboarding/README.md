# modules/onboarding

L05 — Onboarding Tour: one tour per repo (Architecture overview, Critical paths, How to
run locally, Guided reading path, First tasks). Spec: `specs/L05-onboarding-tour.md`
(SPEC-02). Plan: `specs/plans/2026-10-11-l05-onboarding-tour.plan.md`.

## Shape
`routes.ts` (the only file reading `app.container`) → `service.ts` (`OnboardingService`,
takes `OnboardingDeps`) → `ports.ts` → `repository.ts` (Drizzle; tables
`onboarding_generations` and `onboarding` in `db/schema/context.ts`). Pure logic in
`helpers/{facts,grounding,tour,prompt}.ts`; tunables in `constants.ts`; the LLM output
schema `TourDraft` and the job payload in `types.ts`. repo-intel is read only through the
structural `TourFactsSource` port (`container.repoIntel` satisfies it); git only through
`TreeSource` (`listTree` / `showFile` / `currentHead` — git objects, never the working tree).

## Routes
- `GET /repos/:id/onboarding` → `OnboardingView` (tour, latest generation, `clone_ready`,
  `indexing`, `current_commit_sha`). Reads only: no LLM, no tree, no facts.
- `POST /repos/:id/onboarding/generate` → 202 `OnboardingGeneration`; 409 `conflict` while
  one runs, 409 `clone_not_ready` without a readable clone; 404 outside the workspace.

## Flow (job `onboarding-generate`, `retries: 0`, `timeoutMs` 300 s)
1. Index state → commit (`lastIndexedSha`, else HEAD) and snapshot (`off` when
   `REPO_INTEL_ENABLED=false`; `files_total = filesIndexed + filesLeftOut`).
2. Tree at the commit; a pruned commit falls back to `HEAD`, and the stored `commit_sha`
   is the SHA actually listed.
3. Facts, no LLM: `package.json` (root + nested), compose, README (≤ 4,000 chars) via
   `showFile` at the commit; indexed set via `getFileRank` in chunks of 1,000; reading path
   from `getTopFilesByRank(50)` + a stricter filter; critical paths + `getImporterCounts`
   (null when the index is degraded/failed/off).
4. Index off/degraded/failed (with indexable languages) → skeleton, 0 calls.
5. Otherwise ONE `completeStructured` call: `maxRetries: 0`, `transportRetries: 0`,
   `reasoning: 'off'`, `maxTokens: 4000`, adapter `timeoutMs` 125 s, raced against our own
   120 s timer. No key → `no_llm_key`; timeout → `llm_timeout`; schema miss →
   `invalid_output`; anything else → `llm_error`; input over 12,000 tokens → `llm_error`
   with 0 calls. Every failure gives a whole-tour skeleton, never a second call.
6. `completeGeneration` (one transaction, only while the row is `running`): a skeleton
   never replaces a stored LLM tour (`kept_previous`); a late or orphaned run is `discarded`.
7. One `onboarding tour generation finished` log line per run: ids, `llm_calls`, model,
   tokens, cost, kind, reason, outcome — never repo content or prompt text.

## Gotchas
- An interrupted generation is stored as `failed` + `detail = 'Interrupted'`; a `running`
  row older than 15 min is also reported `interrupted`.
- **Routes are an approximation (Q8):** endpoints of files that reach the top-30 ranked
  files (`getBlastRadius(...).factsByFile`); routes in isolated files are missed. They are
  only an LLM input, never a shown count.
- The race does not cancel the provider call (`withTimeout`); the status-guarded store
  keeps a late answer out.
- Provider errors pass through `redactSecrets` before they are stored or logged.
