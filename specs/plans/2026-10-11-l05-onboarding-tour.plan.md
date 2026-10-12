# Plan: SPEC-02 Onboarding Tour (L05)
Status: ready · Date: 2026-10-11 · Branch: feat/l05-onboarding-tour · Packages: reviewer-core, server, client
Spec: `specs/L05-onboarding-tour.md` (SPEC-02, approved) · Execution: multi-agent · Round: 3 (cross-model review applied)

> Q7 resolved by the user: **A** — one facade method `getImporterCounts` over the existing `getImporters` query (S5 as written).

## Cross-model review amendments (round 3) — these OVERRIDE the step text below
Reviewer: independent model (Fable 5.1), verdict APPROVE-WITH-CHANGES. Each step header below points at the amendments that apply to it.
- **A1 (major, S1/R1):** `server/test/contracts.test.ts:12` imports `Onboarding` and `:173-186` parses the old shape. S1 SHALL replace that case and its import with `OnboardingTour` / `OnboardingView` fixtures, else R1 ends red. Done-when grep uses `rg -w "OnboardingSection|OnboardingLink"` (so `OnboardingSectionId` doesn't match).
- **A2 (major, S8, AC-57/79):** `groundMarkdown` treats EVERY schemeless link target as a repo path: strip leading `./` and `/`, reject any `..` segment, then look it up in `fileSet`. Grounded → inline code; ungrounded → removed and counted. Tests: `/src/a.ts`, `./src/a.ts`, `../a.ts`, `src/nope.ts`. (`Markdown.tsx:30-34` would otherwise render any surviving `<a href>`.)
- **A3 (S11, AC-20/46):** `classifyLlmError` order: `/timed out|timeout/i`, `TimeoutError`, `APIConnectionTimeoutError` → `llm_timeout`; then `/schema validation/i` → `invalid_output`; else `llm_error`. One test per adapter message (`openrouter.ts:150-153`, `resilience.ts:6-10`, OpenRouter SDK client `timeout: 90_000`).
- **A4 (S4/S11):** the DB enum stays `running|done|failed`. An interrupted generation is stored as `status='failed', detail='Interrupted'` (precedent `conventions/service.ts:51`). `view` reports `interrupted` for (a) a `running` row older than 15 min and (b) a `failed` row with `detail='Interrupted'`.
- **A5 (S10, AC-52):** `jobs` has no created-at column; "fresh" means `scheduled_at` within 15 min (`schema/ops.ts:21-23`).
- **A6 (S10/S11):** port `systemPrompt(): Promise<string>` (`renderPrompt` is async, `platform/prompts.ts:40`; precedent `conventions/ports.ts:69`); S11 awaits it before `buildTourMessages`.
- **A7 (S9, AC-33):** after the existing cut list, cap root scripts, then structure entries, until `inputTokens ≤ 12,000`. Test: a pathological input still asserts `inputTokens ≤ 12,000`.
- **A8 (S8, AC-83):** `validateRunStep` skips `-`-prefixed tokens before the script name, consuming the value of `--filter`, `--dir`, `-C`, `--prefix`. Tests: `pnpm --filter server dev`, `pnpm -r build`, `npm --prefix web run dev`.
- **A9 (S13):** rewrite the `client/src/vendor/ui/nav.test.ts:15-18` case to WORKSPACE `["pulls","onboarding-tour","context"]`.
- **A10 (S11, AC-54/57):** when `listTree(commitSha)` is null and the tree falls back to HEAD, the stored `commit_sha` is the SHA actually listed (HEAD), so grounding and the shown commit agree; AC-55 staleness then compares it to the index SHA.
- **A11 (S12, AC-21):** add an it-test: generation A's row is already `failed` (job timeout), user starts B, A's handler completes → `completeGeneration` returns `discarded`, `onboarding` untouched.
- **A12 (nits):** Constraints wording → "never repo content or prompt text" (AC-34 needs `repo: fullName`). S12 it-test needs no `MockSecretsProvider` key: `container.llm` returns `overrides.llm[id]` first (`conventions.it.test.ts:101,110`). S2: the per-request-override test builds the provider WITHOUT constructor `maxRetries`; send `reasoning:{enabled:false}` only when `this.id === 'openrouter'`. AC table: AC-22 also maps to S4 (second cascade); AC-32 is server-side (S11), S14 only displays it.

- **A13 (user-accepted deviation, after R2 review):** S8 `groundMarkdown` runs on a real CommonMark+GFM parser. New server dependencies `mdast-util-from-markdown`, `mdast-util-gfm`, `micromark-extension-gfm` (`server/package.json`, `pnpm-lock.yaml`), the same grammar the client renders with (react-markdown + remark-gfm). Accepted by the user 2026-10-12.

## Goal
When the plan is done, the active repo has a tour page at `/repos/<id>/tour`, opened from a new "Onboarding Tour" sidebar item. The page shows five sections in a fixed order: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.

A generation starts only when the user asks. It runs in the background and:
- collects the facts deterministically from repo-intel and the local clone;
- orders the reading path by PageRank;
- makes at most one structured LLM call, and logs the call count, tokens and cost;
- checks every path against the tree at the tour's commit;
- falls back to a deterministic skeleton with a plain status when the index is degraded, there is no key, or the LLM fails or times out.

One tour is stored per repo. It carries its commit, index status, model, tokens and cost. The page flags a stale tour and offers Regenerate. This covers the spec's seven Goals. Its Non-goals stay out: share link, hotness, Project Context, PR Brief, the `/onboarding` page, per-branch or automatic tours, retries, a file viewer, editing, MCP, docs sync and the CI runner.

## Context read
- `CLAUDE.md`:
  - Contract first; edit both `vendor/shared` copies.
  - Outside dependencies go through adapters in the DI container.
  - Every query is scoped by `workspaceId`.
  - Never hand-edit migrations.
  - Never weaken `groundFindings` or `INJECTION_GUARD`.
- `server/AGENTS.md` and `server/src/modules/AGENTS.md`: routes → service (`…Deps`) → repository. Long work goes through `container.jobs`. Cross-module data goes only through `container.<x>`.
- `server/src/modules/repo-intel/AGENTS.md`: consumers read only through the facade, and the facade degrades instead of throwing.
- `server/src/modules/conventions/AGENTS.md` and `conventions/{service,routes,repository,constants}.ts` are the pattern copied here:
  - one paid structured call per job, with `retries: 0`;
  - `completeScan` writes only while the scan is `running`;
  - a stale `running` scan (15 min) is reported as failed;
  - errors pass through `redactSecrets`;
  - a partial unique index allows one running scan;
  - the feature model is read from the `settings` row.
- `server/INSIGHTS.md`:
  - "NEVER store or show a raw LLM provider error": AC-49.
  - "`withTimeout` does not cancel": AC-21 needs a status-guarded store, not only a race.
  - "bare `slice(0, N)` … lone surrogate": the AC-85 README cut.
  - "`file_facts` of test files hold `app.inject` URLs": blast's `attributeFacts` already filters them.
  - "lesson briefs overstate the repo-intel facade": I read `service.ts` (findings below).
  - "review it-tests hit REAL GitHub/OpenRouter": it-tests pass `MockSecretsProvider` and `llm` overrides.
  - "`tsx watch` misses reviewer-core edits": restart before the smoke.
  - "NEVER `arch:baseline`".
  - "`db:migrate` NOTICE noise": trust the exit code.
- Root `INSIGHTS.md`:
  - "typecheck skips test files": only vitest proves the test steps.
  - "shared copies have drifted": the `StructuredRequest` change goes into the server copy only.
- `client/AGENTS.md`, `client/src/app/AGENTS.md` and `client/INSIGHTS.md`:
  - next-intl, and the `@devdigest/ui` barrel for all UI imports;
  - ICU plural with `t.rich` for counts;
  - no `onError` toast in mutation hooks;
  - tests use `fireEvent` and mocked `@/lib/hooks/…`;
  - vitest can't filter by a `[repoId]` path.
- The spec, all of it (AC-1…AC-68, AC-70, AC-75…AC-85, AC-87…AC-91, EC-1…EC-29), plus designs `specs/designs/onboarding-tour/01-…png` and `02-…png`.
- `.claude/skills/pr-self-review/references/routing.md`: the source of each step's skills.
- What the code already has, checked:
  - `server/src/db/schema/context.ts:126`: `onboarding` has `repoId` PK with an FK cascade to `repos`, a `json` jsonb column and `generatedAt`. Repos are hard-deleted (`repos/repository.ts:80`).
  - `Onboarding`, `OnboardingSection` and `OnboardingLink` in `contracts/knowledge.ts` are identical in both copies and unused. Their shape doesn't fit the spec (EC-27).
  - `FEATURE_MODELS.onboarding` defaults to `openrouter` / `deepseek/deepseek-v4-flash` (`contracts/platform.ts:45`).
  - `server/src/prompts/onboarding.system.md` names the old sections and has its own SECURITY paragraph instead of `INJECTION_GUARD`.
  - repo-intel facade (`modules/repo-intel/types.ts:146`, `service.ts`):
    - `getIndexState` gives `status`, `filesIndexed`, `filesLeftOut`, `lastIndexedSha` and `reason`. It synthesizes `degraded`/`no_data` and does not reflect `REPO_INTEL_ENABLED=false`.
    - `getTopFilesByRank` returns rank DESC through `isJunkPath`. That filter has no generated-folder patterns and misses a root-level `test/`.
    - `getCriticalPaths` takes the top-5 roots, `BFS_DEPTH = 2`, and returns `[]` with no edges or with the flag off.
    - `getFileRank(repoId, paths)` returns rows only for paths in `file_rank`. `file_rank` holds every walked file, isolated ones included (`pipeline/rank.ts:9`).
    - `getBlastRadius(repoId, files)` returns `callers` (symbol references, capped at 20 per symbol, each with `rank`) and `factsByFile` (endpoints of caller files and their importers, tests filtered). It is empty on a failed or degraded index.
    - `getRepoMap(repoId, 1500)` and `getSymbolsInFiles`.
    - There is **no** read for "how many files import X".
  - `GitClient.listTree` / `showFile` read git objects, never the working tree, so a committed `.env` is never read (EC-15).
  - `container.tokenizer.count` (tiktoken with a fallback).
  - LLM adapters:
    - `OpenAIProvider` and `AnthropicProvider` wrap each attempt in `withRetry` (3 retries on 429/5xx), and their SDKs default to `maxRetries` 2.
    - `OpenRouterProvider` builds its SDK client with `maxRetries: 2` and passes `{ signal }` per request (`openrouter.ts:143`). With `req.maxRetries: 0` it makes one attempt and aborts at `req.timeoutMs`. Its retry path already sends `reasoning: {enabled:false}` (`:130`).
    - All three adapters throw "… failed schema validation" on a schema miss.
    - Research: openai 4.104.0 and @anthropic-ai/sdk 0.33.1 accept a per-request `maxRetries`.
  - `INJECTION_GUARD` is a non-exported `const` (`reviewer-core/src/prompt.ts:16`); `wrapUntrusted` is exported.
  - `JobRunner` defaults to a 120 s timeout, 2 retries and concurrency 3, with rows in `jobs`. Job kinds: `'clone'`, `repo-intel-index`, `-refresh`, `-resync`. `repo-intel` `resyncRepo` returns `no_clone` and never clones. `POST /repos/:id/refresh` (`useRefreshRepo`) re-enqueues the clone.
  - Client:
    - `components/app-shell/helpers.ts:33` maps `/onboarding` to `"onboarding-tour"`.
    - `vendor/ui/nav.ts` has no tour item.
    - `MermaidDiagram` uses `securityLevel: 'strict'` and renders nothing on invalid input. Research: Mermaid 11.15 takes `htmlLabels: false` at the root.
    - `@devdigest/ui` `Markdown` uses react-markdown 9 without rehype-raw, so raw HTML is not rendered.
    - `lib/path-ellipsis.ts` has `middleEllipsisPath`; there are also `components/repo-not-found` and `useRepoNotFound`.
    - `messages/en/onboarding.json` holds the old section set.
- `git status`: on `feat/l05-onboarding-tour`; only `.claude/settings.json` is untracked.

## Requirements review
| Req | Finding | Kind | Went to |
|---|---|---|---|
| AC-31, AC-88 | Adapters retry 429/5xx/timeouts at the transport level, so one "call" can be re-sent. | conflict with code | R2 (accepted), S2/S3 |
| AC-87 | 4,000 output tokens on a reasoning model: hidden reasoning counts toward `max_tokens`. | conflict with code (practical) | R3 (accepted), S2/S3 |
| AC-59 | `INJECTION_GUARD` is not exported. | conflict with code | R1 (accepted), S2/S9 |
| AC-26 | `getTopFilesByRank`'s junk filter misses generated folders and a root-level `test/`. Changing it would change Conventions sampling. | conflict with code | S7: stricter local filter over an over-fetched pool |
| AC-2, EC-19 | `activeKeyFor` marks `/onboarding` as the tour. | conflict with code | S13 |
| AC-45 (folder counts) | No "indexed paths" read. Derivable: `getFileRank` over the clone's source-file candidates returns exactly the indexed ones. | derived (R7 rejected) | S11 |
| AC-24 (routes ≤ 50) | No repo-wide endpoint read. Derivable approximately: `getBlastRadius(top-30 ranked files).factsByFile`, i.e. endpoints in files that reach the core files, tests excluded. | derived, approximation | S11, Risks, Q8 (non-blocking) |
| AC-70 | No read gives "number of indexed files that import X". `getBlastRadius` callers are symbol references capped at 20 per symbol, and empty on a degraded index. | not derivable exactly | **Q7 (blocking, S5 only)** |
| AC-75 | The "switched off" flag is only in config. | gap | S11: inject `indexEnabled` from `config.repoIntelEnabled` |
| AC-52 | The index state has no running status; clone and index jobs live only in `jobs`. | gap | S10, Q6 |
| AC-84 | The repo-intel "resync" can't create a missing clone. | how | R5 (accepted): `useRefreshRepo` |
| AC-12…AC-23, AC-77, AC-78 | Running, interrupted and kept-previous states need storage of their own. | design | R4 (accepted), S4 |
| AC-83 vs AC-81 | `cp .env.example .env` names a `.env` that doesn't exist. | ambiguity | Q1 (non-blocking, assumed: the `cp` destination is not checked) |
| AC-81 | No lockfile. | ambiguity | Q2 (non-blocking, assumed: `npm install` if a root `package.json` exists) |
| AC-33 | No cut order is given for facts that aren't files. | ambiguity | Q3 (non-blocking, order in S9) |
| AC-79 | With R8 rejected, grounded paths render as inline code and nothing in section text is a link to a repo file. "As a link only when grounded" then holds trivially. | how (user decision) | S8, S17 |
| AC-43 | Telling "invalid output" from "LLM error" relies on the adapters' error text. | risk | Risks; S11 |
| (none) | A generation failing outside the LLM (e.g. a git error) isn't covered by the spec. | ambiguity | Q5 (non-blocking, assumed: status `failed`, stored tour untouched, banner) |
| AC-50, AC-56 | Already true by construction: only `POST …/generate` enqueues or writes. | — | S12 checks |

## Recommendations
User answers, Round 2:
- R1 · safer · Guard export: **accepted**. Export `INJECTION_GUARD` unchanged and append it to the onboarding system message. Repo text goes only inside `wrapUntrusted` blocks with fixed labels. → S2, S9
- R2 · safer · No retries: **accepted**. Add `StructuredRequest.transportRetries` (server copy). OpenRouter passes a per-request `maxRetries`; OpenAI and Anthropic pass it to `withRetry` and as a per-request SDK `maxRetries`. Onboarding sends `0`. → S2, S3, S11
- R3 · safer · Reasoning off: **accepted**. Add `StructuredRequest.reasoning: 'off'`. OpenRouter then sends `reasoning: {enabled:false}` from attempt 1. → S2, S3, S11
- R4 · reuse · Gen table: **accepted**. New table `onboarding_generations` (partial unique index on running). The tour and its metadata go in the existing `onboarding.json`. → S4, S10
- R5 · reuse · Re-clone: **accepted**. AC-84 "Resync" = `useRefreshRepo` (`POST /repos/:id/refresh`). → S16
- R6 · safer · Step guard: **rejected**. Run steps are checked only by AC-62 and AC-83. No shell-operator or URL-scheme rules. HTML stays unrendered through the existing `Markdown` (no rehype-raw). → S8, S17
- R7 · reuse · Facade +3: **rejected**. Indexed paths and routes are derived from existing facade reads (S11). The importer count can't be derived. → Q7
- R8 · simpler · Path links: **rejected**. No GitHub links and no `linkHref`. Grounded paths become inline code; ungrounded file links are removed and counted. → S8, S17

## Constraints
- Contract first, then server, then client. The `Onboarding*` block changes identically in `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`. Source: `CLAUDE.md`.
  - Exception: `StructuredRequest.transportRetries`/`reasoning` go into the server `adapters.ts` only. The client never calls an LLM, and its copy has already drifted. Source: root `INSIGHTS.md`, `client/AGENTS.md`.
- New module `server/src/modules/onboarding/`. Source: skill `onion-architecture`, `modules/AGENTS.md`, the `project-context/constants.ts` precedent.
  - Only `routes.ts` reads `app.container`.
  - `service.ts` takes `OnboardingDeps` and never `Container`.
  - `repository.ts` is the only place with Drizzle.
  - Pure `helpers/*.ts`, plus `constants.ts` and `types.ts`.
  - It never imports `repo-intel/*` or `repos/*`. `SUPPORTED_EXT`, `EXCLUDED_DIRS`, the job kinds and `codePointCut` are copied, each with a source comment.
- repo-intel is read only through `container.repoIntel`, behind a structural port in `onboarding/ports.ts` (the `blast/ports.ts` `BlastSource` precedent). **No new facade method, except the one Q7-A allows.** Source: `repo-intel/AGENTS.md`, user's R7 answer.
- Every query is scoped by `workspaceId`: the generations table directly, `onboarding` through `repos.workspaceId`, `jobs` by its column. Source: `CLAUDE.md`.
- Migration only through `cd server && pnpm db:generate` then `pnpm db:migrate`. Source: `CLAUDE.md` "Do not touch".
- `groundFindings` is untouched. The `INJECTION_GUARD` text stays byte-identical; only the `export` keyword is added. Source: `CLAUDE.md`, `reviewer-core/AGENTS.md`.
- `redactSecrets` runs on provider error text before it is stored, logged or returned. Source: `server/INSIGHTS.md`.
- The job is registered with `retries: 0` and an explicit `timeoutMs`. The store is guarded by the generation's `running` status, inside one transaction. Source: `conventions/AGENTS.md`, `server/INSIGHTS.md`.
- Log lines carry ids, counts, model and cost, never repo content or prompt text. Source: `blast/ports.ts` `BlastLogger`.
- Tests:
  - Server tests are flat in `server/test/`. Files that import `pg.ts` are `*.it.test.ts` and pass `MockSecretsProvider` and `llm` overrides.
  - reviewer-core runs with npm.
  - `arch:check` stays green; never run `arch:baseline`.
  - Source: `server/AGENTS.md`, `server/INSIGHTS.md`.
- Client:
  - Server calls only through `lib/hooks/onboarding.ts`, exported from `lib/hooks/index.ts`.
  - Strings in `messages/en/onboarding.json`; counts as ICU plural with `t.rich`.
  - UI only from the `@devdigest/ui` barrel; tour components in `app/repos/[repoId]/tour/_components/`; a thin `page.tsx`.
  - `@devdigest/ui` `Markdown` is used unchanged.
  - Source: `client/AGENTS.md`, `client/src/app/AGENTS.md`, skill `frontend-ui-architecture`.

## Affected modules
| Package | File | Action |
|---|---|---|
| server+client | `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts` | edit |
| server | `server/src/vendor/shared/adapters.ts` | edit (StructuredRequest, server copy only) |
| reviewer-core | `reviewer-core/src/index.ts`, `reviewer-core/src/prompt.ts` (`export` only), `reviewer-core/src/llm/openrouter.ts`, `reviewer-core/test/openrouter-timeout.test.ts`, `reviewer-core/test/prompt.test.ts` | edit |
| server | `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts` | edit |
| server | `server/src/db/schema/context.ts`, `server/src/db/migrations/<generated>` | edit / generated |
| server | `server/src/modules/repo-intel/{types.ts,service.ts}` | edit (Q7-A only: one method, no new SQL) |
| server | `server/src/modules/onboarding/{constants,types,ports,repository,service,routes}.ts`, `…/onboarding/helpers/{facts,grounding,tour,prompt}.ts`, `…/onboarding/README.md` | new |
| server | `server/src/prompts/onboarding.system.md` | rewrite |
| server | `server/src/modules/index.ts`, `server/AGENTS.md` (one Docs line) | edit |
| server | `server/test/onboarding-{facts,grounding,prompt,service}.test.ts`, `server/test/onboarding.it.test.ts`, `server/test/repo-intel-facade-degraded.test.ts`, `server/test/repo-intel-onboarding.it.test.ts` (Q7-A) | new / edit |
| client | `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts` (new) | edit / new |
| client | `client/src/components/mermaid-diagram/MermaidDiagram.tsx`, `…/MermaidDiagram.test.tsx` (new) | edit / new |
| client | `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/onboarding.test.tsx`, `client/src/lib/hooks/index.ts`, `client/src/lib/types.ts` | new / edit |
| client | `client/src/app/repos/[repoId]/tour/page.tsx`, `…/tour/constants.ts`, `…/tour/_components/OnboardingTourView/*`, `…/_components/{TourHeader,StatusBanners,OnThisPage,TourSection,TourMarkdown,ArchitectureSection,CriticalPathsSection,RunLocallySection,ReadingPathSection,FirstTasksSection}/*` | new |
| client | `client/messages/en/onboarding.json` | rewrite |

## Steps

### S1: Tour contracts, both copies
> Amendments: A1 (see top).
- Package: server+client · Depends on: none · Covers: AC-5, AC-6, AC-11, AC-35, AC-40, AC-46, AC-47, AC-53, AC-54, AC-55, AC-58, AC-68, AC-78 (shapes), EC-27
- Files: `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts` (edit, an identical "Onboarding" block)
- Change: replace the unused `OnboardingLink`, `OnboardingSection` and `Onboarding` with:
  - `OnboardingSectionId = z.enum(['architecture','critical_paths','run_locally','reading_path','first_tasks'])`, plus `ONBOARDING_SECTION_IDS` in the AC-6 order.
  - `OnboardingSkeletonReason = z.enum(['no_llm_key','llm_error','llm_timeout','invalid_output','index_degraded','index_failed','index_off'])`.
  - `OnboardingIndexSnapshot = { status: z.enum(['full','partial','degraded','failed','off']), reason: string.nullable(), files_indexed: int, files_total: int }`.
  - `OnboardingCriticalPath = { root, chain: string[], importers: int.nullable(), description: string.nullable() }`. `importers` is null only when the index can't give it (degraded index).
  - `OnboardingReadingItem = { path, reason: string.nullable() }` and `OnboardingRunStep = { command: string }`.
  - `OnboardingTour`:
    - Metadata: `kind: z.enum(['llm','skeleton'])`, `skeleton_reason: Reason.nullable()`, `reason_detail: string.nullable()`, `languages_indexed: boolean`, `index: Snapshot`, `commit_sha`, `generated_at`, `model: string.nullable()`, `tokens_in`/`tokens_out: int.nullable()`, `cost_usd: number.nullable()`, `llm_calls: int.min(0).max(1)`, `removed_ungrounded: int`.
    - `sections.architecture: { body_md, diagram: nullable, stack: string[], folders: {path, files:int}[] }`.
    - `sections.critical_paths: { body_md: nullable, entries: CriticalPath[] }`.
    - `sections.run_locally: { body_md: nullable, steps: RunStep[], source: z.enum(['llm','deterministic']) }`.
    - `sections.reading_path: { body_md: nullable, items: ReadingItem[] }`.
    - `sections.first_tasks: { body_md: nullable }`.
  - `OnboardingGeneration = { id, status: z.enum(['running','done','failed','interrupted']), outcome: z.enum(['stored','kept_previous']).nullable(), reason: Reason.nullable(), detail: string.nullable(), started_at, finished_at: nullable }`.
  - `OnboardingView = { repo_id, tour: OnboardingTour.nullable(), generation: OnboardingGeneration.nullable(), clone_ready: boolean, indexing: boolean, current_commit_sha: string.nullable() }`.
  - Export the types with `z.infer`.
- Skills: zod, onion-architecture, security
- Tests: new `server/test/onboarding-contracts.test.ts`, or extend `server/test/contracts.test.ts` if it exists. Cases:
  - A skeleton tour with null narratives parses.
  - `llm_calls: 2` is rejected.
  - A view with `tour: null` parses.
- Tests-first: no
- Done when:
  - The two Onboarding blocks are byte-identical.
  - `rg "OnboardingSection|OnboardingLink" server/src client/src` finds only the contracts (the old names are gone).
  - Both packages typecheck.

### S2: reviewer-core: export the guard; OpenRouter honours `transportRetries` and `reasoning: 'off'`
> Amendments: A12 (see top).
- Package: reviewer-core · Depends on: S3's `adapters.ts` edit (same run, do it first) · Covers: AC-59, AC-31, AC-88, AC-87, AC-20 (R1, R2, R3)
- Files: `reviewer-core/src/prompt.ts` (add `export` to `INJECTION_GUARD`, text unchanged), `reviewer-core/src/index.ts`, `reviewer-core/src/llm/openrouter.ts` (edit)
- Change:
  - Re-export `INJECTION_GUARD`.
  - In `completeStructured`, the per-request options become `{ signal, ...(req.transportRetries !== undefined ? { maxRetries: req.transportRetries } : {}) }`.
  - `req.reasoning === 'off'` sets `reasoningOff = true` before attempt 1.
  - Without these fields, the request is byte-identical to today.
- Skills: onion-architecture, security
- Tests:
  - `reviewer-core/test/openrouter-timeout.test.ts`, using the local `http` server. Cases:
    - With a 500 response and `transportRetries: 0, maxRetries: 0`, exactly 1 request is made.
    - With `reasoning: 'off'`, the first body has `reasoning.enabled === false`.
    - Without the fields, the body has no `reasoning` key.
  - `reviewer-core/test/prompt.test.ts`: the exported guard is contained in `assemblePrompt(...)` system content.
- Tests-first: yes
- Done when: `./scripts/check.sh reviewer-core server` is green.

### S3: Server LLM port and adapters
- Package: server · Depends on: none · Covers: AC-31, AC-88, AC-87 (R2, R3)
- Files: `server/src/vendor/shared/adapters.ts` (edit: `StructuredRequest.transportRetries?: number`, `reasoning?: 'off'`, with doc comments), `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts` (edit)
- Change: in `completeStructured`, use `withRetry(fn, { retries: req.transportRetries ?? 3 })`. Pass the per-request SDK option `{ maxRetries: req.transportRetries }` when it is set (research: supported in openai 4.104.0, `core.d.ts:211`, and @anthropic-ai/sdk 0.33.1, `core.d.ts:199`). `reasoning` is ignored, as documented.
- Skills: onion-architecture, security
- Tests: none. Both constructors take only a key (no `baseURL`), so a no-network test needs a wider constructor. OpenRouter, the default provider, is tested in S2, and S11 asserts the request fields.
- Tests-first: no
- Done when: the server typechecks and existing callers are unchanged.

### S4: `onboarding_generations` table
> Amendments: A4 (see top).
- Package: server · Depends on: none · Covers: AC-12, AC-14, AC-18, AC-19, AC-21, AC-22, AC-23, AC-77, AC-78 (R4)
- Files: `server/src/db/schema/context.ts` (edit), `server/src/db/migrations/*` (generated)
- Change:
  - Add `onboardingGenerations` (`onboarding_generations`):
    - `id` uuid PK
    - `workspaceId` FK `workspaces` cascade
    - `repoId` FK `repos` cascade
    - `status` text enum `['running','done','failed']` notNull
    - `outcome` text enum `['stored','kept_previous']`
    - `reason` text, `detail` text
    - `startedAt` defaultNow notNull, `finishedAt`
  - An index on `(workspaceId, repoId)`, and `uniqueIndex('onboarding_generations_one_running_uq').on(workspaceId, repoId).where(sql\`status = 'running'\`)`.
  - `onboarding` is unchanged.
  - Run `pnpm db:generate`, then `pnpm db:migrate`.
- Skills: onion-architecture, drizzle-orm-patterns, postgresql-table-design, security
- Tests: none here. The S12 it-test checks uniqueness and both cascades.
- Tests-first: no
- Done when: there is one new migration and `db:migrate` exits 0.

### S5: Importer count source (Q7, default A)
- Package: server · Depends on: none · Covers: AC-70
- Files: `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/service.ts` (edit)
- Change: add **one** facade method, `getImporterCounts(repoId: string, paths: string[]): Promise<Record<string, number>>`:
  - It counts distinct `fromFile` per `toFile` from the **existing** `RepoIntelRepository.getImporters`. No new SQL and no repository change.
  - It returns `{}` when the flag is off.
  - A path with no importers maps to 0.
  - If Q7 = B or C, replace this step with the text in Q7.
- Skills: onion-architecture, security
- Tests:
  - Extend `server/test/repo-intel-facade-degraded.test.ts`: flag off gives `{}`.
  - New `server/test/repo-intel-onboarding.it.test.ts` (pg). Seed `file_edges` with `a→c`, `b→c`, a duplicate `a→c`, and another repo's `x→c`. Then `{ c: 2, a: 0 }`.
  - Grep `server/test` for `RepoIntel` fakes that would now be incomplete.
- Tests-first: yes
- Done when: `./scripts/check.sh --it server` is green and arch:check has no new violation.

### S6: onboarding constants, types and the LLM output schema
- Package: server · Depends on: S1 · Covers: AC-18, AC-20, AC-27, AC-29, AC-33, AC-43, AC-85, AC-87
- Files: `server/src/modules/onboarding/constants.ts`, `server/src/modules/onboarding/types.ts` (new)
- Change:
  - Constants:
    - `GENERATE_JOB_KIND = 'onboarding-generate'`, `GENERATE_JOB_TIMEOUT_MS = 300_000`
    - `STALE_GENERATION_MS = 15 * 60_000`
    - `LLM_TIMEOUT_MS = 120_000`, `LLM_ADAPTER_GRACE_MS = 5_000`
    - `MAX_INPUT_TOKENS = 12_000`, `MAX_OUTPUT_TOKENS = 4_000`, `README_MAX_CHARS = 4_000`
    - `READING_PATH_MAX = 10`, `READING_PATH_POOL = 50`, `CRITICAL_PATHS_MAX = 5`, `ROUTES_MAX = 50`, `ROUTE_SEED_FILES = 30`, `SIGNATURE_FILES = 30`, `REPO_MAP_TOKENS = 1_500`, `FILE_RANK_CHUNK = 1_000`
    - `SYSTEM_PROMPT_TEMPLATE = 'onboarding.system.md'`, `FEATURE_ID = 'onboarding'`
    - `INDEXING_JOB_KINDS = ['clone','repo-intel-index','repo-intel-refresh','repo-intel-resync']`, `INDEXING_FRESH_MS = 15 * 60_000`
    - `SUPPORTED_EXT`, `EXCLUDED_DIRS` (copies)
    - `READING_PATH_EXCLUDE`:
      - segments `test`, `tests`, `__tests__`, `__mocks__`, `__fixtures__`, `migrations`, `generated`, `__generated__`, `dist`, `build`, `.next`, `out`, `coverage`, `vendor`;
      - patterns `.d.ts`, `.test.`, `.spec.`, `.gen.`, `.config.`, `vitest.`, `jest.`, `eslint`, `prettier`.
    - `BASE_PROGRAMS = ['node','npx','make','cp']`, plus `docker compose` and the detected package manager.
    - `LOCKFILES = { 'pnpm-lock.yaml':'pnpm', 'package-lock.json':'npm', 'yarn.lock':'yarn', 'bun.lockb':'bun', 'bun.lock':'bun' }`.
    - `COMPOSE_FILES = ['docker-compose.yml','docker-compose.yaml','compose.yml','compose.yaml']`.
  - `types.ts`:
    - `TourDraft` Zod schema. All keys are required, with `nullable` for strict json_schema:
      - `architecture: { body_md: string.max(6000), diagram: string.max(4000).nullable() }`
      - `critical_paths: { body_md: string.max(2000).nullable(), descriptions: array({ root, description: string.max(200) }).max(5) }`
      - `run_locally: { body_md: string.max(2000).nullable(), steps: array({ command: string.max(300) }).max(10) }`
      - `reading_path: { body_md: string.max(2000).nullable(), reasons: array({ path, reason: string.max(200) }).max(10) }`
      - `first_tasks: { body_md: string.max(4000) }`
    - `GenerateJobPayload` Zod schema: `{ workspaceId, repoId, generationId }`.
    - `TourFacts`: stack, folders, `scriptsByDir`, `packageManager`, `composeFile`, `composeServices`, `hasEnvExample`, `readme`, `routes`, `repoMap`, `signatures`, `readingPath`, `criticalPaths`, `index`, `commitSha`, `languagesIndexed`, `fileSet`.
- Skills: onion-architecture, zod, security
- Tests: exercised through S7–S9.
- Tests-first: no
- Done when: the server typechecks.

### S7: Deterministic facts helpers (pure)
- Package: server · Depends on: S6 · Covers: AC-24, AC-25, AC-26, AC-27, AC-39, AC-45 (data), AC-81, AC-85, EC-3, EC-4, EC-5, EC-15, EC-23
- Files: `server/src/modules/onboarding/helpers/facts.ts` (new)
- Change, all pure functions:
  - `sourceCandidates(treePaths)`: `SUPPORTED_EXT` files outside `EXCLUDED_DIRS`. Used for `hasIndexableFiles` (AC-39) and as the `getFileRank` input that gives the indexed set.
  - `topLevelFolders(treePaths, indexedSet)`: `{path, files}` per top-level directory, where `files` is the number of indexed paths under it (AC-45).
  - `detectPackageManager(treePaths)`, `findComposeFile`, `composeServices(text)` (a line parser for the `services:` keys), `hasEnvExample` (presence only, EC-15).
  - `parseScripts(pkgJson)`: safe JSON parse.
  - `detectStack(rootPkg, treePaths)`: languages by extension, frameworks from dependency names, docker/compose.
  - `readmePath(treePaths)`.
  - `capReadme(text)`: the first 4,000 characters, cut with a copied `codePointCut` (AC-85).
  - `readingPath(rankedPool, fileSet)`: drops `READING_PATH_EXCLUDE` matches and non-files, keeps rank order, takes ≤ 10 (AC-25–27).
  - `routesFromBlast(blast, max)`: endpoints from `factsByFile`, ordered by the highest `callers[].rank` of their file, deduped, ≤ 50.
  - `deterministicRunSteps(facts)` (AC-81):
    1. `<pm> install` (Q2).
    2. `cp .env.example .env` when the file exists.
    3. `docker compose up -d` when a compose file exists.
    4. `dev`, else `start`: `pnpm dev` / `yarn dev` / `npm run dev` / `bun run dev`.
- Skills: onion-architecture, security
- Tests: new `server/test/onboarding-facts.test.ts`. Cases:
  - Folder counts, with `node_modules` excluded.
  - A Python-only tree has no candidates (EC-3).
  - Lockfile → package manager; no lockfile → `npm install`.
  - Compose services are parsed.
  - A committed `.env` yields no fact.
  - The README cut doesn't split an emoji at the 4,000 boundary.
  - The reading path drops `src/a.test.ts`, `test/x.ts`, `types.d.ts`, `db/migrations/1.ts`, `src/generated/x.ts` and `vite.config.ts`, keeps rank order and returns ≤ 10.
  - Routes are deduped, rank-ordered and capped.
  - Run-step variants: `dev`, `start`, no scripts.
  - A malformed `package.json` doesn't throw.
- Tests-first: yes
- Done when: the tests pass.

### S8: Grounding, run-step validation, merge and skeleton (pure)
> Amendments: A2, A8 (see top).
- Package: server · Depends on: S6, S7 · Covers: AC-28, AC-29, AC-30, AC-36, AC-45, AC-57, AC-58, AC-62, AC-70 (data), AC-76, AC-79, AC-80, AC-82, AC-83, AC-90, EC-6, EC-14
- Files: `server/src/modules/onboarding/helpers/grounding.ts`, `server/src/modules/onboarding/helpers/tour.ts` (new)
- Change:
  - `groundMarkdown(md, fileSet) → { md, removed }` (R8 rejected):
    - A Markdown link `[t](p)` with a repo-relative target (no scheme, no leading `/`, `#…` stripped):
      - If `p` is in `fileSet`, rewrite it to the inline code `` `p` ``.
      - Otherwise remove the link and count it (AC-57/58). If `t` is itself the path or looks like a path (contains `/` or a file extension), drop it entirely; otherwise keep `t` as plain text.
    - Links with a scheme are left as written: R6 is rejected, and react-markdown's URL sanitizing still applies.
    - Inline code spans and fenced blocks are untouched. A code span is never a link, which is AC-79's "plain code".
  - `validateRunStep(cmd, ctx: { pm, scriptsByDir, fileSet }) → boolean`, AC-62 and AC-83 only (R6 rejected):
    - The text after a `#` is ignored.
    - The program (the first token, or the first two for `docker compose`) must be the package manager, `node`, `npx`, `docker compose`, `make` or `cp`.
    - Named scripts must exist: `<pm> run X`, or `<pm> X` when X isn't a built-in (`install`, `i`, `ci`, `add`, `exec`, `dlx`), with `--dir`/`-C`/`--prefix <d>` picking `<d>/package.json` (root by default).
    - Every path-like argument (contains `/` or a `.ext`, not a flag) must be in `fileSet`, except `cp`'s last argument (Q1).
    - `make T` needs a root `Makefile`.
  - `tour.ts`:
    - `criticalEntries(chains, importerCounts | null, fileSet)`: the first 5 chains whose root is a file. `chain` is the grounded remainder, `importers = counts?.[root] ?? null` (AC-29, AC-70). No chains → `[]` (AC-30).
    - `buildSkeleton(facts, criticalEntries)` (AC-45):
      - architecture body = stack and folders rendered as Markdown;
      - critical-path entries without descriptions;
      - deterministic run steps;
      - reading items without reasons;
      - `first_tasks.body_md = null`.
    - `mergeDraft(draft, facts, entries) → { sections, removed }`:
      - Reading items stay exactly as computed in S7 (AC-28). Reasons attach by path; a reason for a non-file counts as removed (AC-57).
      - Descriptions attach by root (AC-76); an entry for a non-file root counts as removed.
      - LLM steps are filtered by `validateRunStep`. If none survive, use the deterministic steps with `source: 'deterministic'` (AC-82).
      - Every `body_md` goes through `groundMarkdown`.
      - A section left without content takes its skeleton part (AC-80).
      - `first_tasks` keeps the grounded Markdown (AC-90).
- Skills: onion-architecture, security, zod
- Tests: new `server/test/onboarding-grounding.test.ts`. Cases:
  - `[a](src/a.ts)` (exists) becomes `` `src/a.ts` ``, with `removed` 0.
  - `[src/nope.ts](src/nope.ts)` is removed and `removed` is 1 (EC-6).
  - `[the auth module](src/nope.ts)` becomes the plain text "the auth module", with `removed` 1.
  - Fenced and inline code are untouched.
  - Run steps:
    - Kept: `pnpm install`, `pnpm dev`, `cp .env.example .env`, `docker compose up -d postgres`, `npx tsx scripts/x.ts` (the file exists).
    - Dropped: `curl x`, `python app.py`, `pnpm nosuch`, `node missing.js`, `make` with no Makefile.
  - `mergeDraft` with reordered reading paths plus `src/fake.ts` keeps the S7 order, adds no fake, and counts `removed ≥ 1` (AC-28).
  - Descriptions attach (AC-76).
  - All steps invalid → deterministic steps (AC-82).
  - An empty architecture body → skeleton body (AC-80).
  - The skeleton has every part (AC-45).
  - `importers` is null when counts are null.
- Tests-first: yes
- Done when: the tests pass.

### S9: Prompt builder, budget and template rewrite
> Amendments: A7 (see top).
- Package: server · Depends on: S2, S6, S7 · Covers: AC-33, AC-37, AC-59, AC-85, AC-91, EC-14 (R1)
- Files: `server/src/modules/onboarding/helpers/prompt.ts` (new), `server/src/prompts/onboarding.system.md` (rewrite)
- Change:
  - The template states:
    - the five `TourDraft` keys;
    - one optional simple `flowchart` diagram for the architecture section (keep the existing Mermaid rules);
    - file references only to the given paths, written as plain repo paths;
    - run steps only with listed scripts and files;
    - reasons and descriptions keyed by the given paths, with the order set by DevDigest;
    - `{{language}}`, rendered as `English` (AC-91);
    - no HTML.
  - The old SECURITY paragraph is removed.
  - `buildTourMessages({ system, repoName, facts, count }) → { messages, inputTokens, cut }`:
    - The system message is `system + '\n\n' + INJECTION_GUARD`.
    - The user message has our headings, each followed by `wrapUntrusted('<fixed label>', …)` for `index-status`, `stack`, `structure`, `readme`, `reading-path`, `critical-paths`, `scripts`, `run-facts`, `routes`, `repo-map` and `signatures` (AC-59).
    - Budget (AC-33, Q3): while `count(system) + count(user) > 12,000`, cut in this order:
      1. signatures, lowest-ranked file first;
      2. repo map;
      3. routes, lowest-ranked first;
      4. nested scripts, deepest first;
      5. README, halved then dropped.
    - The reading path and critical paths are never cut.
- Skills: onion-architecture, security
- Tests: new `server/test/onboarding-prompt.test.ts`. Cases:
  - The system message ends with the exported guard.
  - An injection README appears only inside an `<untrusted` block.
  - The system text contains "English".
  - With a fake counter, the cut order holds and the total stays ≤ 12,000.
  - A 10k README contributes ≤ 4,000 characters.
  - A small input is not cut.
- Tests-first: yes
- Done when: the tests pass and `{{sections}}` is gone from the template.

### S10: Ports and repository
> Amendments: A5, A6 (see top).
- Package: server · Depends on: S1, S4, S6 · Covers: AC-14, AC-16, AC-21, AC-22, AC-23, AC-31 (model choice), AC-50, AC-52, AC-54, AC-68, AC-77, AC-78
- Files: `server/src/modules/onboarding/ports.ts`, `server/src/modules/onboarding/repository.ts` (new)
- Change:
  - `OnboardingTarget { id, owner, name, fullName, clonePath }`.
  - `OnboardingRepo`, scoped by `workspaceId`:
    - `findRepo`.
    - `featureModel(ws)`: settings `feature_models.onboarding`, else the `FEATURE_MODELS` default.
    - `latestGeneration`.
    - `createGeneration`: a 23505 on the one-running index becomes `ConflictError`.
    - `failGeneration(ws, id, detail)`: only while `running`.
    - `completeGeneration(ws, id, tour): 'stored' | 'kept_previous' | 'discarded'`, in one transaction:
      1. `UPDATE … SET status='done' … WHERE id AND workspace AND status='running' RETURNING`. No row means `discarded` (AC-21/23).
      2. Read the stored `json.kind` through the `repos` join.
      3. If the new tour is a skeleton and the stored kind is `llm`, set `outcome = kept_previous` plus reason and detail (AC-77/78). Otherwise upsert `onboarding` and set `outcome = stored` (AC-16).
    - `getTour`: `OnboardingTour.safeParse`; legacy or invalid data gives `null`.
    - `indexingInProgress`: `jobs` rows of `INDEXING_JOB_KINDS` that are queued or running, with `payload->>'repoId'` = the repo, created within 15 min (Q6).
  - `TourFactsSource`: a structural subset of the existing facade: `getIndexState`, `getTopFilesByRank`, `getCriticalPaths`, `getFileRank`, `getBlastRadius`, `getRepoMap`, `getSymbolsInFiles`, plus `getImporterCounts` under Q7-A.
  - `TreeSource { listTree; showFile; currentHead }`, `JobQueue`, `TourLogger { info(obj, msg) }`.
  - `OnboardingDeps { repo, intel, git, jobs, llm, systemPrompt, countTokens, indexEnabled, log, now? }`.
  - `OnboardingRepository implements OnboardingRepo` and maps rows to contracts.
- Skills: onion-architecture, drizzle-orm-patterns, zod, security
- Tests: the S12 it-test covers this (transaction, unique index, cascades, scoping). The service test uses a fake.
- Tests-first: no
- Done when: the server typechecks.

### S11: OnboardingService
> Amendments: A3, A4, A6, A10 (see top).
- Package: server · Depends on: S5, S7, S8, S9, S10 · Covers: AC-12, AC-14, AC-17, AC-18, AC-19, AC-20, AC-21, AC-23, AC-24, AC-31, AC-32, AC-34, AC-35, AC-39, AC-41, AC-42, AC-43, AC-44, AC-45 (folder data), AC-49, AC-51, AC-54, AC-56, AC-68, AC-70, AC-75, AC-77, AC-88, EC-8, EC-10, EC-18, EC-21, EC-22, EC-28
- Files: `server/src/modules/onboarding/service.ts` (new)
- Change:
  - `view(ws, repoId)` reads only (AC-32): `findRepo` (404), `getTour`, `latestGeneration` (running for more than 15 min is reported as `interrupted`, AC-18), `indexingInProgress`, `getIndexState().lastIndexedSha`, and `clone_ready = clonePath != null`. No LLM call, no tree read, no fact collection.
  - `start(ws, repoId)`:
    - `findRepo`.
    - No clone, or `listTree(repo, 'HEAD') === null`, gives `AppError('clone_not_ready', …, 409)` (AC-51).
    - A running generation that is not stale gives `ConflictError` (AC-14). A stale one is failed as `interrupted` and the start proceeds (AC-19).
    - `createGeneration`, then enqueue. On an enqueue error, fail the generation. `job.done.catch` fails it with a redacted message.
    - Returns the generation (AC-12).
  - `run(payload)` never throws:
    1. Index state:
       - `commitSha = lastIndexedSha || currentHead`.
       - Snapshot: `files_total = filesIndexed + (filesLeftOut ?? 0)`, status `off` when `!indexEnabled` (AC-54, AC-68).
    2. Tree at `commitSha`, falling back to `HEAD`. This gives `fileSet` and `languagesIndexed` (S7 candidates are non-empty).
    3. Facts, with no LLM call (AC-24):
       - `showFile` for the root and nested `package.json`, the compose file and the README.
       - The indexed set from `getFileRank(candidates)` in chunks of 1,000; folder counts follow (AC-45).
       - `getTopFilesByRank(50)`, then `readingPath`.
       - `getCriticalPaths`, then importer counts of the roots (Q7). These are null when the index is degraded, failed or off.
       - Routes from `getBlastRadius(top 30 ranked)` via `routesFromBlast` (Q8).
       - `getRepoMap(1500)` and `getSymbolsInFiles(top 30)`.
       - When `!languagesIndexed`, the reading path and critical paths are `[]` (AC-39).
    4. Decide:
       - `!languagesIndexed` → go to the LLM (AC-39).
       - Index off, degraded or failed → skeleton with 0 calls (AC-75).
       - Partial or full → go to the LLM (AC-44).
    5. LLM:
       - `featureModel`, then `llm(provider)`. A `ConfigError` gives skeleton `no_llm_key` with 0 calls (AC-41).
       - Otherwise make exactly one `completeStructured({ model, schema: TourDraft, schemaName: 'OnboardingTourDraft', messages, temperature: 0.2, maxTokens: 4000, maxRetries: 0, transportRetries: 0, reasoning: 'off', timeoutMs: 125_000 })`, raced against a 120 s timer (injectable clock).
       - Timeout → skeleton `llm_timeout`; the late promise is `.catch`ed and ignored (AC-20/21).
       - Rejection → `classifyLlmError` (`/schema validation/i` → `invalid_output`, otherwise `llm_error`) → skeleton (AC-42/43). Never a second call (AC-88).
       - Success → `mergeDraft`, `kind: 'llm'` (AC-36).
    6. Build the tour: model, tokens and cost (AC-35), `removed_ungrounded`, `reason_detail = redactSecrets(msg)` (AC-49).
    7. `completeGeneration`.
    8. One `log.info({ repoId, repo: fullName, llm_calls, model, tokens_in, tokens_out, cost_usd, kind, reason, outcome }, 'onboarding tour generation finished')` on every terminal path, including `discarded` and errors (AC-34).
    9. On a thrown error, fail the generation with a redacted message, then log (Q5).
- Skills: onion-architecture, security, zod
- Tests: new `server/test/onboarding-service.test.ts`, with fakes for repo, intel, git, jobs, log and a controllable LLM. Cases:
  - Start / conflict / stale → interrupted → accepted / no clone → 409 (AC-12, 14, 18, 19, 51).
  - `view` makes 0 LLM, tree or fact calls (AC-32).
  - Full index plus key → one call with `maxRetries: 0`, `transportRetries: 0`, `maxTokens: 4000`, `reasoning: 'off'` and the feature model's provider and model (AC-31, 87, 88).
  - No key → 0 calls (AC-41).
  - An error echoing `sk-or-v1-…` → `llm_error` with a redacted detail and log line (AC-42, 49).
  - A schema-validation message → `invalid_output` (AC-43).
  - Fake-clock timeout → `llm_timeout`, and a late resolve doesn't store (AC-20, 21).
  - Degraded, failed or off → skeleton with 0 calls (AC-75).
  - Partial → one call and a `partial` snapshot (AC-44, 68).
  - Python-only tree with a degraded index → one call, empty reading and critical paths (AC-39).
  - `discarded` → logged only (AC-23).
  - `commit_sha` is the indexed SHA (AC-54).
  - The log line has every field (AC-34) and the stored cost fields are set (AC-35).
  - Folder counts come from `getFileRank` rows (AC-45).
  - Importer counts appear on the entries (AC-70).
- Tests-first: yes
- Done when: the tests pass and arch:check is green.

### S12: Routes, job, registry, README
> Amendments: A11, A12 (see top).
- Package: server · Depends on: S11 · Covers: AC-12, AC-14, AC-17, AC-22, AC-23, AC-32, AC-50, AC-51, AC-56, AC-77
- Files: `server/src/modules/onboarding/routes.ts` (new), `server/src/modules/index.ts` (edit: 1 import + 1 entry), `server/src/modules/onboarding/README.md` (new: flow, limits, retry and reasoning settings, the routes approximation), `server/AGENTS.md` (one Docs line)
- Change:
  - `routes.ts` wires:
    - `repo: new OnboardingRepository(c.db)`
    - `intel: c.repoIntel`, `git: c.git`, `jobs: c.jobs`
    - `llm: (p) => c.llm(p)`
    - `systemPrompt: () => renderPrompt(SYSTEM_PROMPT_TEMPLATE, { language: 'English' })`
    - `countTokens: (t) => c.tokenizer.count(t)`
    - `indexEnabled: c.config.repoIntelEnabled`
    - `log: app.log`
  - Register the job: `c.jobs.register(GENERATE_JOB_KIND, (p) => service.run(GenerateJobPayload.parse(p)), { retries: 0, timeoutMs: GENERATE_JOB_TIMEOUT_MS })`.
  - Routes, each with `IdParams` and `getContext` first:
    - `GET /repos/:id/onboarding` returns an `OnboardingView`.
    - `POST /repos/:id/onboarding/generate` returns 202 with an `OnboardingGeneration`.
- Skills: onion-architecture, fastify-best-practices, zod, security
- Tests: new `server/test/onboarding.it.test.ts`, using pg and `buildApp` with `MockSecretsProvider` (OpenRouter key), `llm.openrouter = MockLLMProvider` with a valid `TourDraft`, `MockGitClient` with a tree, and a `repoIntel` stub. Cases:
  - POST returns 202, then polling GET reaches `done` and the tour has `kind: llm` (AC-12, 17).
  - Two parallel POSTs give one 202 and one 409 (AC-14).
  - GET on a fresh repo creates no generation row (AC-56).
  - `DELETE /repos/:id` removes the tour (AC-22).
  - Deleting the repo during a generation stores nothing (AC-23).
  - A skeleton regeneration over a stored LLM tour leaves the tour unchanged, with `outcome: kept_previous` (AC-77).
  - `clone_path` null gives 409 (AC-51).
  - Another workspace's repo gives 404.
- Tests-first: yes
- Done when: `./scripts/check.sh --it server` is green.

### S13: Sidebar item and active-key fix
> Amendments: A9 (see top).
- Package: client · Depends on: none · Covers: AC-1, AC-2, EC-19
- Files: `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`, `client/src/components/app-shell/helpers.ts` (edit), `client/src/components/app-shell/helpers.test.ts` (new)
- Change:
  - Add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Boxes", href: "/repos/:repoId/tour" }` between `pulls` and `context`.
  - In `activeKeyFor`, replace `includes("/onboarding")` with `/^\/repos\/[^/]+\/tour(\/|$)/`.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
- Tests:
  - `nav.test.ts`: WORKSPACE keys are `["pulls","onboarding-tour","context"]` and the tour href resolves.
  - `helpers.test.ts`: `/onboarding` → `""`, `/repos/r1/tour` → `"onboarding-tour"`, and `/repos/r1/context` is unchanged.
- Tests-first: yes
- Done when: the tests pass.

### S14: Data hooks
- Package: client · Depends on: S1, S12 · Covers: AC-12, AC-13, AC-17, AC-32
- Files: `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/onboarding.test.tsx` (new), `client/src/lib/hooks/index.ts`, `client/src/lib/types.ts` (edit)
- Change:
  - `useOnboardingTour(repoId)`: key `["onboarding", repoId]`. Polls every 2,000 ms while `generation?.status === "running"` or `indexing`.
  - `useGenerateOnboardingTour(repoId)`: POST, then `setQueryData` with the returned generation and invalidate on settled. No `onError` toast.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
- Tests: `onboarding.test.tsx`. Cases:
  - It polls while running and stops when done.
  - The mutation writes `running` into the cache.
- Tests-first: no
- Done when: the tests pass and the hook is exported.

### S15: Strict Mermaid
- Package: client · Depends on: none · Covers: AC-37, AC-38, AC-61
- Files: `client/src/components/mermaid-diagram/MermaidDiagram.tsx` (edit at `:37`), `client/src/components/mermaid-diagram/MermaidDiagram.test.tsx` (new)
- Change: `initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict", htmlLabels: false })`. Root-level `htmlLabels` per the Mermaid 11.15 research; `flowchart.htmlLabels` is deprecated.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library, security
- Tests: `vi.mock("mermaid")`. Cases:
  - The config has `securityLevel: "strict"` and `htmlLabels: false`.
  - `parse` returning false renders nothing and no error text (AC-38).
- Tests-first: no
- Done when: the tests pass.

### S16: Tour page shell, states and banners
- Package: client · Depends on: S13, S14, S15 · Covers: AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-13, AC-15, AC-40, AC-46, AC-47, AC-48, AC-52, AC-53, AC-55, AC-58, AC-78, AC-84 (R5), EC-1, EC-12, EC-13, EC-21, EC-24, EC-25, EC-28
- Files:
  - `client/src/app/repos/[repoId]/tour/page.tsx`
  - `…/tour/constants.ts`
  - `…/tour/_components/OnboardingTourView/{OnboardingTourView.tsx,index.ts,styles.ts,helpers.ts,OnboardingTourView.test.tsx}`
  - `…/_components/{TourHeader,StatusBanners,OnThisPage,TourSection}/*`
  - `client/messages/en/onboarding.json` (rewrite)
- Change:
  - `page.tsx` renders `OnboardingTourView` (like the conventions page).
  - View states:
    - `useRepoNotFound` → `RepoNotFound` (AC-3).
    - Loading → `Skeleton` (AC-4).
    - Error → `ErrorState` with a Retry that calls `refetch` (AC-10).
    - No tour → `EmptyState` naming the five sections, with Generate (AC-5).
    - With a tour: header, banners, `OnThisPage` and five `TourSection`s in `ONBOARDING_SECTION_IDS` order (AC-6).
    - Running → the button shows "Generating…" disabled and the stored tour stays visible (AC-13, 15).
    - `!clone_ready` → "Resync" through `useRefreshRepo` (AC-84).
    - `indexing` → Generate is disabled, with an "Indexing in progress" note (AC-52).
  - `TourHeader`:
    - "Generated from index of {n} files · {sha7} · {relative time}" (AC-11).
    - "{n} of {m} source files indexed" when n < m (AC-53).
    - Regenerate, and no Share link (EC-25).
  - `StatusBanners` (text, not colour only):
    - The skeleton reason (AC-46). For `no_llm_key`, a link to `/settings/api-keys` (AC-48).
    - A partial index with its reason (AC-47).
    - "Languages not indexed — reading path and critical paths are empty" (AC-40).
    - "{n} ungrounded items removed" (AC-58).
    - "Last regeneration failed: {reason}" when `outcome = kept_previous` (AC-78).
    - "Generation failed" (Q5).
    - "Stale: tour at {a}, index at {b}" with Regenerate when `current_commit_sha` differs from `tour.commit_sha` (AC-55).
  - `OnThisPage`: one button per section. It scrolls with `scrollIntoView`, then focuses the section's `h2` (`tabIndex={-1}`) (AC-7, 8).
  - `TourSection`: an `h2` with an id, plus a collapse button with `aria-expanded` and `aria-controls` (AC-9).
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library, security
- Tests: `OnboardingTourView.test.tsx`, mocking `@/lib/hooks/onboarding`, `useRefreshRepo` and `@/lib/repo-context`. Cases: AC-3, 4, 5, 6 (DOM order), 7, 8 (focus), 9, 10, 11, 53, 13, 15, 46 (each reason), 47, 48 (href), 40, 58, 78, 55, 84, 52.
- Tests-first: yes
- Done when: the tests pass and the sidebar item is active on `/repos/<id>/tour`.

### S17: Section bodies
- Package: client · Depends on: S16 · Covers: AC-25 (render), AC-29, AC-30, AC-36, AC-37, AC-38, AC-45 (render), AC-60, AC-63, AC-64, AC-65, AC-66, AC-67, AC-70, AC-76, AC-79, AC-82 (render), AC-89, AC-90, EC-16, EC-17, EC-26, EC-29
- Files: `…/tour/_components/{TourMarkdown,ArchitectureSection,CriticalPathsSection,RunLocallySection,ReadingPathSection,FirstTasksSection}/*` (new; tests where there is logic), `client/messages/en/onboarding.json` (edit)
- Change:
  - `TourMarkdown({ md })` renders `<Markdown variant="document">` from `@devdigest/ui`, unchanged. There is no raw HTML (AC-60). Grounded paths arrive as inline code and are never links to repo files (AC-79, R8 rejected).
  - `ArchitectureSection`: body, then `MermaidDiagram` when there is a diagram (AC-37/38), then stack and folders.
  - `CriticalPathsSection`: ≤ 5 rows. Each shows the root path, "→ a.ts → b.ts" as secondary text, "{n} importers" (omitted when null), and the description on LLM tours. No Open button. When empty: "No import chains found" (AC-29, 30, 65, 70, 76).
  - `RunLocallySection`:
    - Numbered `<code>` rows, each with a copy button calling `navigator.clipboard.writeText(command)` and labelled `aria-label="Copy command: {command}"`.
    - An `aria-live="polite"` region announces "Copied".
    - A note when `source === 'deterministic'` (AC-63, 64, 66, 82).
  - `ReadingPathSection`: an ordered list of path plus reason, with the note "Ordered by import-graph importance (PageRank)" (AC-25, 89).
  - `FirstTasksSection`: `TourMarkdown`, or the note "First tasks need the LLM" (AC-45, 90).
  - Long paths use `middleEllipsisPath`, with the full path in `title` and the accessible name (AC-67).
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library, security
- Tests: one per component, with `MermaidDiagram` mocked. Cases:
  - Copying writes the exact command and "Copied" appears in the live region.
  - Button names contain the command.
  - Rows show importers and description, and have no Open button.
  - The empty critical-paths text.
  - Reading-path order and note.
  - A 120-character path is shortened and its full `title` is kept.
  - `` `src/a.ts` `` renders as `code` with no `<a>`.
  - `<script>` and `<img onerror>` are not rendered.
  - The first-tasks skeleton note.
- Tests-first: no
- Done when: `./scripts/check.sh client` is green.

## Runs
| Run | Steps | Ends green on |
|---|---|---|
| R1 | S1–S5 | `./scripts/check.sh server reviewer-core client` and `./scripts/check.sh --it server` |
| R2 | S6–S9 | `./scripts/check.sh server` |
| R3 | S10–S12 | `./scripts/check.sh --it server` |
| R4 | S13–S17 | `./scripts/check.sh client` |

## Contract changes
1. `@devdigest/shared` server copy (S1), then the client copy (same step, identical block).
2. The server-only `adapters.ts` `StructuredRequest` change (S3, before S2).
3. reviewer-core (S2).
4. The server: S4–S12, with the repo-intel facade +1 method only under Q7-A.
5. The client: S13–S17.

## Verification
- `./scripts/check.sh server reviewer-core client`: typecheck, unit tests and arch:check.
- `./scripts/check.sh --it server`: the generations table, the unique index, the cascades, the facade method (Q7-A) and the end-to-end generate flow.
- `cd server && pnpm db:migrate` exits 0 after S4.
- `rg -n "onboarding-generate|GENERATE_JOB_KIND" server/src` matches only `modules/onboarding/*` (AC-56).
- `git diff main -- reviewer-core/src/prompt.ts` shows only the `export` keyword. `groundFindings` is untouched.
- `git diff main --stat -- server/src/modules/repo-intel` is empty, or under Q7-A only `types.ts` and `service.ts` (one method).
- Smoke, after R4. Restart `./scripts/dev.sh` (the reviewer-core edit needs it) and run `pnpm db:migrate`. On the DevDigest repo:
  1. "Onboarding Tour" sits between Pull Requests and Project Context, and `/onboarding` doesn't highlight it.
  2. `/repos/<id>/tour` shows the empty state with the five sections. Click Generate: "Generating…" appears, then the tour.
  3. Check that:
     - the sections are in order;
     - the reading path has ≤ 10 non-test files and the PageRank note;
     - critical paths show importer counts;
     - copy works;
     - paths render as code;
     - the header shows the file count, short SHA and time.
  4. The server log has exactly one `onboarding tour generation finished` line with `llm_calls: 1`, `model`, `tokens_in`, `tokens_out` and `cost_usd`. Check that `tokens_out` ≤ 4,000 (R3).
  5. Switch the Onboarding Tour provider to one with no key and Regenerate. The LLM tour stays, with "Last regeneration failed: No LLM key", and the log shows `llm_calls: 0`.

## Acceptance criteria
Every AC in the spec maps to at least one step and one check.

| AC | Steps | Check |
|---|---|---|
| AC-1 | S13 | `nav.test.ts`, `app-shell/helpers.test.ts` |
| AC-2 | S13 | `helpers.test.ts` `/onboarding` → `""` |
| AC-3 | S16 | view: no repo |
| AC-4 | S16 | view: loading |
| AC-5 | S1, S16 | view: empty state names five sections |
| AC-6 | S1, S16 | view: DOM order |
| AC-7 | S16 | view: on-this-page entries |
| AC-8 | S16 | view: focus on the heading |
| AC-9 | S16 | view: `aria-expanded` |
| AC-10 | S16 | view: error + Retry |
| AC-11 | S1, S11, S16 | view: header meta; service snapshot |
| AC-12 | S11, S12, S14 | service start; it-test 202 |
| AC-13 | S14, S16 | hook polling; view disabled state |
| AC-14 | S4, S10, S11, S12 | service conflict; it-test parallel POSTs |
| AC-15 | S16 | view keeps the tour while running |
| AC-16 | S10, S11 | it-test stored; service skeleton with none stored |
| AC-77 | S10, S11, S12 | it-test `kept_previous` |
| AC-78 | S1, S16 | view banner |
| AC-17 | S12, S14 | it-test poll to done; hook refetch |
| AC-18 | S6, S11 | service 16-min interrupted |
| AC-19 | S11 | service restart after interrupted |
| AC-20 | S6, S11 | service fake-clock timeout |
| AC-21 | S10, S11 | service late answer; conditional update |
| AC-22 | S12 (existing FK cascade, `context.ts:127`) | it-test DELETE repo |
| AC-23 | S10, S12 | it-test delete while running |
| AC-24 | S7, S11 | facts tests; service fact calls before any LLM |
| AC-25 | S7, S11, S17 | facts order; ReadingPathSection |
| AC-89 | S17 | ReadingPathSection note |
| AC-26 | S7 | facts exclusions |
| AC-27 | S7 | facts ≤ 10 |
| AC-28 | S8 | `mergeDraft` order |
| AC-29 | S8, S17 | `criticalEntries` ≤ 5; component |
| AC-70 | S5 (Q7), S8, S11, S17 | facade it-test; service; component importers |
| AC-76 | S8, S17 | merge descriptions; component |
| AC-30 | S8, S17 | empty chains → text |
| AC-31 | S2, S3, S10, S11 | service: 1 call with the feature model |
| AC-88 | S2, S3, S11 | openrouter 500 → 1 request; service no second call |
| AC-32 | S11, S14 | service `view` makes no calls |
| AC-33 | S9 | prompt budget |
| AC-85 | S7, S9 | README cap |
| AC-87 | S2, S3, S11 | service `maxTokens: 4000`, reasoning off |
| AC-34 | S11 | service log fields |
| AC-35 | S1, S11 | service stored cost fields |
| AC-36 | S8, S11, S17 | merge bodies; components render them |
| AC-37 | S9, S15, S17 | ArchitectureSection diagram |
| AC-38 | S15, S17 | invalid diagram → nothing |
| AC-90 | S8, S17 | FirstTasksSection Markdown |
| AC-91 | S9, S12 | prompt "English" |
| AC-39 | S7, S11 | service: Python-only |
| AC-40 | S1, S16 | view banner |
| AC-41 | S11 | service: no key, 0 calls |
| AC-42 | S11 | service: provider error |
| AC-43 | S6, S11 | service: `invalid_output` |
| AC-44 | S11 | service: partial |
| AC-75 | S11 | service: degraded / failed / off |
| AC-68 | S1, S11 | service snapshot |
| AC-45 | S7, S8, S11, S17 | `buildSkeleton`; folder counts; FirstTasks note |
| AC-46 | S1, S16 | view reason banners |
| AC-47 | S16 | view partial banner |
| AC-48 | S16 | view settings link |
| AC-49 | S11 | service redaction |
| AC-50 | S1, S10 (stored in the tour JSON; written only by `completeGeneration`) | it-test; `rg` check |
| AC-51 | S11, S12 | service + it-test 409 |
| AC-84 | S16 | view Resync via `useRefreshRepo` |
| AC-52 | S10, S16 | view indexing state |
| AC-53 | S1, S16 | view "N of M" |
| AC-54 | S11 | service `commit_sha` |
| AC-55 | S16 | view stale notice |
| AC-56 | S11, S12 | it-test GET creates nothing; `rg` check |
| AC-57 | S8 | grounding tests |
| AC-79 | S8, S17 | grounded path → code; no links to repo files |
| AC-80 | S8 | merge: empty section → skeleton |
| AC-58 | S8, S16 | `removed` count; banner |
| AC-59 | S2, S9 | prompt: guard + untrusted blocks |
| AC-60 | S17 | no script / img rendered |
| AC-61 | S15 | Mermaid config test |
| AC-62 | S8 | program cases |
| AC-83 | S8 | script and file existence cases |
| AC-81 | S7 | deterministic steps |
| AC-82 | S8, S17 | fallback; deterministic note |
| AC-63 | S17 | exact command copied |
| AC-64 | S17 | live region "Copied" |
| AC-65 | S17 | no Open button |
| AC-66 | S17 | aria-label contains the command |
| AC-67 | S17 | middle ellipsis + title |

## Risks
- **AC-70 (Q7).** Under B, the counts are symbol-reference callers, capped at 20 per symbol and null on a degraded index, so they undercount for heavily imported roots. Under A, `RepoIntel` gains one method; any hand-written fake fails only when that method is called (typecheck skips tests), which S5 greps for.
- **Routes (Q8) are an approximation.** They come from `getBlastRadius` over the top-30 ranked files: only endpoints in files that reference those files' symbols, or import such files. Routes in isolated files are missed. This affects only an LLM input, nothing shown as a count. It is noted in the module README.
- **Indexed set through `getFileRank` with up to ~5,000 paths**, in chunks of 1,000 (`inArray`). This is cheap and runs only during generation, never on page views.
- **`classifyLlmError` relies on adapter error text.** If the text changes, the banner reads "LLM error" instead of "invalid output".
- **Reasoning off (R3).** The model allows it (`mandatory: false`), and the adapter already uses `{enabled:false}` on its retry path. The documented form is `effort: "none"`. The smoke checks `tokens_out` and that the answer is not empty.
- **R6 rejected.** A step like `pnpm install && <anything>` passes AC-62/83, because only the first program is checked. Steps are only copied, never run, and render as plain code. The user accepted this.
- **R8 rejected.** Section text has no clickable repo paths. AC-79 holds because nothing is a link.
- **The 120 s race doesn't cancel OpenAI or Anthropic calls** (`withTimeout`). The adapter gets 125 s, and the status-guarded store blocks a late write.
- **Shared queue.** Jobs run with concurrency 3, so a generation can wait behind clone or index jobs. The interrupted window counts from row creation.
- **`indexing` is inferred from `jobs` rows.** Rows orphaned by a crash are bounded by the 15-minute freshness window.
- **A pruned commit.** If `listTree(commitSha)` fails after a resync pruned that commit, grounding falls back to `HEAD`.
- **The token budget uses tiktoken `cl100k`.** The provider's `tokens_in` may differ by a few percent.
- **The design shows Open buttons and a Share link.** The spec drops both (AC-65, EC-25).

## Out of scope
- Spec Non-goals: share link, hotness, per-branch/PR/commit tours, auto-generation, MCP tool, writing docs to the repo, an in-app file viewer, hand edits, automatic retries.
- Any change to `/onboarding` beyond the highlight fix.
- Fixing `getTopFilesByRank`'s junk filter for Conventions.
- New repo-intel facade reads (R7 rejected), except Q7-A.
- PR Brief, Project Context, agent-runner (L06).

## Needs research
- None open. Round 2 settled per-request `maxRetries` (openai 4.104.0, @anthropic-ai/sdk 0.33.1), Mermaid root `htmlLabels: false`, and the reasoning-off support of `deepseek-v4-flash`.

## INSIGHTS discrepancies
- `server/src/modules/repo-intel/AGENTS.md` says "`getConventionSamples` … unused". `conventions/routes.ts:32` uses it, along with `getTestSamples` and `getTopFilesByRank`.
- `server/src/modules/repo-intel/README.md` says only `getRepoMap`, `getFileRank` and `getCallerSignatures` are wired. `getBlastRadius` (blast) and the Conventions samplers are wired too.
- `client/src/lib/hooks/repo-intel.ts` has a stale header comment pointing at the removed `useIndexStatus`/`useReindex` (for doc-writer).

## Open questions
- **Resolved (user, round 2): Q7 = A.** Kept below for the record:
  - Q7 · header: Importers. AC-70 needs "the number of indexed files that import its root file, computed from the index". No existing facade read returns this. `getCriticalPaths` gives chains only. `getBlastRadius` gives symbol-reference callers, capped at 20 per symbol and empty on a degraded index. Options:
    - A) (Recommended) Add one facade method, `getImporterCounts(repoId, paths)`, over the **existing** `RepoIntelRepository.getImporters` query. That means about 10 lines in `types.ts` and `service.ts`, no new SQL and no table access outside repo-intel. S5 as written.
    - B) No facade change. Approximate with `getBlastRadius(repoId, [root])`: count the distinct `callers[].file`, shown as "{n}+ importers" when any symbol hit the cap of 20; null on a degraded index. Replacement text: drop S5 and its tests, remove `getImporterCounts` from `TourFactsSource`, and add `importersFromBlast(blast)` to S8 with tests (dedupe, cap flag, empty → null). AC-70 is then only approximately met; record it in Risks.
    - C) Spec change via spec-creator: relax AC-70 to "files that reference symbols of the root, up to 20 per symbol", or drop it. Drop S5 and the importer parts of S8, S11 and S17 until the spec is updated.
- **Non-blocking (assumptions taken):**
  - Q1: `cp`'s last argument is not required to exist (S8).
  - Q2: with no lockfile, `npm install` when a root `package.json` exists (S7).
  - Q3: the budget cut order in S9.
  - Q5: a non-LLM failure marks the generation `failed`, leaves the stored tour untouched and shows a banner (S11, S16).
  - Q6: "indexing" means a fresh `jobs` row of kind `clone` or `repo-intel-*` (S10).
  - Q8: the routes fact (≤ 50) is derived from `getBlastRadius` over the top-30 ranked files (S7, S11), because R7 was rejected. The alternative is a facade read, which would need R7 back.

## Execution mode
Chosen: **multi-agent** (QX answered in Round 2). Four runs. This changes the shared contract in both copies, the DB schema, the LLM adapters, a reviewer-core export and a system prompt.

## For the calling session
- Q7 answered A by the user — no replacement text applied.
- Optionally confirm Q8. If the user wants exact repo-wide routes, that brings back one facade read (partial R7).
- Save as `/home/nazar/dev-digest/specs/plans/2026-10-11-l05-onboarding-tour.plan.md`.
- Record the INSIGHTS discrepancies via `/engineering-insights`.

