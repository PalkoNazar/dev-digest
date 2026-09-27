# INSIGHTS — cross-package

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

## 2026-09-27 — `@devdigest/shared` copies have drifted (promoted)
`server/src/vendor/shared` vs `client/src/vendor/shared` differ in `adapters.ts`,
`contracts/{trace,eval-ci,knowledge,productionize}.ts`; the client `LLMProvider.id`
has no `'openrouter'`. Check: `diff -r server/src/vendor/shared client/src/vendor/shared`.

## 2026-09-27 — reviewer-core deps are a server prerequisite (promoted)
reviewer-core pins `zod` to its own `node_modules`; without `npm ci` there the
server fails to boot. `scripts/dev.sh` installs it since commit 66727c8.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

## What Doesn't Work

### 2026-09-27 — no formatter config: never run `npx prettier --write`
NEVER run prettier (or any formatter) on repo files; format edits by hand to match the file.
Why: there is no prettier/eslint/biome/editorconfig in root, `server/` or `client/`, so prettier
falls back to defaults (double quotes, 80 cols) and rewrites the whole file against the repo's
single-quote ~100-col style. Evidence: `ls -a . server client` — no formatter config.

## Codebase Patterns

### 2026-09-27 — new fields on the stored trace contract must be nullish
ALWAYS add fields to `RunTrace`/`RunStats` as `.nullish()`, never required or `.nullable()`.
Why: `run_traces.trace` is one jsonb doc per run; rows written before the field existed lack it
and `GET /runs/:id/trace` must still parse. Evidence: `contracts/trace.ts` `RunStats.cost_usd`.

### 2026-09-27 — PR-list aggregates: SCORE/FINDINGS = latest review, COST = SHA round
Take per-PR review data for the list from the latest `kind='review'` row; only COST matches runs by `head_sha`.
Why: `agent_runs.head_sha` exists only since migration 0010 — a SHA-round match hides every pre-L01
review's data. Evidence: `server/src/modules/pulls/routes.ts` (`latestReviewByPr` vs `roundCostByPr`).

## Tool & Library Notes

### 2026-09-27 — pnpm isn't on PATH; `corepack pnpm` leaves a stray file
Use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <cmd>`, then delete `server/pnpm-workspace.yaml`
and `client/pnpm-workspace.yaml`. Why: corepack fetches pnpm 12, whose install writes an `allowBuilds`
workspace file — which contradicts "not a monorepo". Lockfiles stay unchanged.

### 2026-09-27 — rename + symlink at the old path: two commits, or history is lost
Commit the pure `git mv CLAUDE.md AGENTS.md` first; add the `CLAUDE.md -> AGENTS.md` symlink in a second commit.
Why: in one commit the old path still exists, so git records a type change (`T`) plus a new file, not a
rename, and `git log --follow AGENTS.md` stops at that commit. A squash-merge (or squashing the branch) has
the same effect. PR #6 was squashed to one commit by owner's choice (one commit per branch), accepting the
lost `--follow` history for the AGENTS.md files.

## Recurring Errors & Fixes

### 2026-09-27 — new API field "missing" after checkout/pull → stale `tsx watch`
After `git checkout`/`git pull` under a running `pnpm dev`, check the process start time and `touch server/src/server.ts`.
Why: tsx watch restarted on the checkout, before the pull's files landed, and kept serving the old code —
the PR list showed "—" everywhere while the code was correct. Evidence: `ps -o lstart -p <pid on :3001>`.

## Session Notes

2026-09-27 — L01 cost badge (server+client): 2 entries (trace contract nullish, corepack pnpm).
2026-09-27 — L01 PR-list COST: SQL SUM + agent_runs_ws_pr_sha_idx (review fix): 1 entry (no formatter config).
2026-09-27 — CLAUDE.md → AGENTS.md + CLAUDE.md symlinks (PR #6): 1 entry (rename+symlink history vs. single-commit branch).
2026-09-27 — PR-list FINDINGS column (server+client): 1 entry (list aggregates source); +1 in client/INSIGHTS.md.
2026-09-27 — findings card deep link + stale tsx-watch debugging: 1 entry (stale watch after checkout/pull).
2026-09-27 — pr-self-review skill (.claude/skills + .githooks): 1 entry in server/INSIGHTS.md (arch:check red on main) + 1 open question.

## Open Questions
