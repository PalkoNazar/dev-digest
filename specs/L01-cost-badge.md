# Run cost badge
Status: done · Lesson: L01 · Packages: server, client

## Goal
Show what every agent review run costs (USD + tokens) so the user can see spend at a
glance: per PR in the Pull Requests list, per run in the PR's Agent runs timeline, and
in the Agent run drawer's stats. Data comes from what the LLM call already returns
(`usage.prompt_tokens` / `completion_tokens`, OpenRouter `usage.cost`, else the price
book) — **zero extra model calls**.

## Scope
- In:
  - Persist cost per run (`agent_runs.cost_usd`) and the SHA each run reviewed
    (`agent_runs.head_sha`).
  - Expose `cost_usd` on `RunSummary`, `RunStats` and `PrMeta` (list endpoint).
  - Client `RunCostBadge` component, two variants:
    - `compact` → `$0.014` (PR list `COST` column, between STATUS and UPDATED)
    - `full` → `9,119 tok · $0.0013` (timeline run card, right meta block, under time)
  - `COST` stat tile in the run drawer (DURATION · TOKENS · COST · FINDINGS).
- Out:
  - Backfilling cost for runs recorded before this feature (they show `—`).
  - Budgets, alerts, per-agent/model cost analytics (Agent Performance page).
  - Cost of non-review LLM calls (eval, conventions, …).

## Design
**Where cost comes from.** reviewer-core `runReview()` already sums `costUsd` over its
LLM calls (`null` if any call's price is unknown). `run-executor` persists it with
`completeAgentRun` and writes it into the trace `stats`.

**Tables.** `agent_runs` gets two nullable columns (migration via `pnpm db:generate`):
- `cost_usd double precision` — null = unknown price / legacy run
- `head_sha text` — PR head SHA at run start

**Contracts** (`@devdigest/shared`, both copies):
- `RunSummary.cost_usd: number | null`
- `RunStats.cost_usd?: number | null` (nullish: legacy jsonb traces lack the field)
- `PrMeta.cost_usd?: number | null` (list endpoint only)

**PR cost = last review round.** `GET /repos/:id/pulls` sums `cost_usd` of `done`
runs whose `head_sha = pull_requests.last_reviewed_sha`. No such runs, or none with a
known cost → `null`. A new push (stale PR) keeps showing the last round's cost.

**Format** (`formatUsd`): `null` → `—` (never `$0.00`); `0` → `$0`; `≥ $1` → 2 dp;
`≥ $0.01` → 3 dp; below → 4 dp; trailing zeros past cents trimmed (`$0.06`);
`< $0.0001` → `<$0.0001`. Tokens: `tokens_in + tokens_out`, `en-US` grouping.

**UI entry points.**
- `client/src/app/repos/[repoId]/pulls/_components/PRRow` — `COST` column
- `.../[number]/_components/RunHistory` — run card meta block (done runs only)
- `.../[number]/_components/RunTraceDrawer/_components/TraceBody` — `COST` stat

## Acceptance criteria
- [x] Every finished (`done`) run shows its cost badge in the timeline and drawer.
- [x] A run without cost data shows `—`, not `$0.00`.
- [x] PR list shows the summed cost of the last review round; unreviewed PRs → `—`.
- [x] No additional LLM calls are made to compute cost.
- [x] Old traces without `cost_usd` still parse and render.
- [x] server + client typecheck and tests pass; both shared copies updated.

## Open questions
- Should failed runs that consumed tokens before erroring report partial cost? (Today:
  reviewer-core throws, the partial usage is lost → `null`.)
