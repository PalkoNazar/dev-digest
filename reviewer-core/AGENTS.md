# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: diff → prompt → LLM → structured output → grounded findings.
Consumed as TypeScript SOURCE by the server (path alias); never emits JS.

## Commands (npm, not pnpm)
`npm ci` · `npm test` (vitest, stubbed LLM — no keys/network) · `npm run typecheck` (= build)

## Layout
- `src/index.ts` — the only public surface; export anything new from here
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate against the diff
- `src/llm/structured.ts` — Zod → JSON Schema, `extractJson`, `parseWithRepair`
- `src/llm/openrouter.ts` — the OpenRouter provider (the server imports it from here)
- `src/review/run.ts` — `reviewPullRequest` orchestrator · `reduce.ts` — map-reduce merge
- `src/output/to-review.ts` — CI payload helper (used from L06)

## Rules
- NO database, filesystem, GitHub or env access. The only side effect is the
  injected `LLMProvider` — that is what keeps it mock-testable.
- Every finding must pass `groundFindings`; the score is recomputed from surviving
  findings. Never trust model-reported score/verdict.
- Untrusted text (diff, PR body, repo content) is wrapped via `wrapUntrusted` and
  never parsed for "ignore this" phrases — the defense is `INJECTION_GUARD` only.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`, `intent`) are
  omitted from the prompt when empty — keep that "absent ⇒ identical prompt" contract.
- `applyScopeFilter` (`review/scope.ts`) runs only AFTER `groundFindings` and only when
  `scopeMode` is set; `scoreFromFindings` is computed on the post-filter set. The
  unfiltered model output stays in `raw`; `ReviewOutcome.scope` is null when off.

## Gotchas
- OpenRouter answers `200` + keep-alive whitespace at once and the JSON only when
  generation ends; the OpenAI SDK `timeout` stops at the headers. `completeStructured`
  therefore aborts the whole call (body + attempts) after `req.timeoutMs` (default 10 min).
- Reasoning models (deepseek-v4-flash) can think for 40k–135k hidden tokens; only
  `max_tokens` bounds that (`reasoning.max_tokens`/`effort` don't). OpenRouter calls default
  to `max_tokens` 24k; a cap hit with an empty answer retries once with `reasoning: {enabled:false}`.
  Tokens don't bound time (some endpoints run ~29 tok/s), so a reasoning attempt gets 60% of the
  budget when a retry is left, then retries without reasoning; calls route `provider.sort: throughput`.
- `@devdigest/shared` resolves to `../server/src/vendor/shared` — a contract change
  there can break this package (its CI watches that path too).
- `zod` is pinned to this package's own `node_modules` via tsconfig `paths`;
  without `npm ci` here the SERVER fails to typecheck/run.
- Strategy `auto` picks map-reduce only for large multi-file diffs
  (`DEFAULT_MAP_THRESHOLD_LINES` = 400); otherwise single-pass.

## Docs
Pipeline diagram: `README.md` · prompt conventions: `/docs/agent-prompts/README.md` ·
deep dives: `docs/` · specs: `specs/` · learned: `INSIGHTS.md`
