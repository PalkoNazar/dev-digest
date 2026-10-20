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

### 2026-10-11 — agent checks: one compact `scripts/check.sh`, not raw suite runs
Do have agents verify with `./scripts/check.sh` (`--related` per step, plain per run): one line per command, a short excerpt on failure.
Why: each package suite takes 2–5 s (server 279 tests, client 152, all four packages ≈ 8 s in parallel), so the cost was turns and log tokens from the same commands run 3–4× (implementer, plan-verifier, hard checks), not wall time. Evidence: `./scripts/check.sh server client reviewer-core mcp` on chore/sdd-workflow.

## What Doesn't Work

### 2026-09-27 — no formatter config: never run `npx prettier --write`
NEVER run prettier (or any formatter) on repo files; format edits by hand to match the file.
Why: there is no prettier/eslint/biome/editorconfig in root, `server/` or `client/`, so prettier
falls back to defaults (double quotes, 80 cols) and rewrites the whole file against the repo's
single-quote ~100-col style. Evidence: `ls -a . server client` — no formatter config.

### 2026-10-11 — hook guards: check the resulting file, block flag-writers, never fail open
NEVER validate an Edit by its `new_string` alone, never trust a Bash denylist to cover "read" commands with output flags, never detect the hook entry point with `` `file://${argv[1]}` ``.
Why: PR #29 review found that Edit `draft`→`approved` slipped past a `Status:` regex, `git diff --output=<file>` / `git format-patch -o` / `sort -o` wrote with no `>`, and the URL compare misses on paths with spaces, so the hook exited 0 for everything. Fix: apply the edit and check the result; use `pathToFileURL(realpathSync(argv[1]))`. Evidence: `.claude/hooks/*.test.mjs` fail 5 + 7 cases on the old code.

### 2026-10-11 — git in a read-only guard must be an allowlist; `-c` and `GIT_*` env run commands
NEVER denylist git subcommands in `readonly-bash.mjs`; allow known read subcommands only and block `-c`, `--config-env`, `--exec-path`, `GIT_*`/`*PAGER` env prefixes and `git grep -O`.
Why: `git -c 'alias.x=!touch f' x` (and `-c core.pager=…`, `GIT_PAGER=…`) run a shell with no `>` and no denied word; `env FOO=1 rm x` also slipped past a single prefix shift. Test counts quoted in entries above are as of their commit (`1a653d1`: 6/15). Evidence: `node .claude/hooks/readonly-bash.test.mjs` (19 allowed, 42 blocked).

## Codebase Patterns

### 2026-09-27 — new fields on the stored trace contract must be nullish
ALWAYS add fields to `RunTrace`/`RunStats` as `.nullish()`, never required or `.nullable()`.
Why: `run_traces.trace` is one jsonb doc per run; rows written before the field existed lack it
and `GET /runs/:id/trace` must still parse. Evidence: `contracts/trace.ts` `RunStats.cost_usd`.

### 2026-09-27 — PR-list aggregates: SCORE/FINDINGS = latest review, COST = SHA round
Take per-PR review data for the list from the latest `kind='review'` row; only COST matches runs by `head_sha`.
Why: `agent_runs.head_sha` exists only since migration 0010 — a SHA-round match hides every pre-L01
review's data. Evidence: `server/src/modules/pulls/routes.ts` (`latestReviewByPr` vs `roundCostByPr`).

### 2026-09-29 — agents pick skills from `pr-self-review/references/routing.md`
ALWAYS change which skill applies to which files in `.claude/skills/pr-self-review/references/routing.md`, not in agent prompts.
Why: `planner` assigns skills per plan step from that table, `implementer` loads skills from it and `/pr-self-review`
reviews with it — one table keeps plan, code and review on the same rules. Evidence: `.claude/agents/{planner,implementer}.md`.

### 2026-09-29 — agent write scopes are prompt rules; check them with `git status` after the run
ALWAYS run `git status --short` after a test-writer / doc-writer / implementer run and compare with the scope the agent was given.
Why: subagent frontmatter can allow or deny `Write`/`Edit` but not limit them to paths, so "only test files" and "only
docs" live in the prompt only. plan-verifier's reverse scan is the second check. Evidence: `.claude/agents/README.md` Permissions.

### 2026-09-30 — read-only agents: Bash writes are blocked by a hook, write scopes still aren't
Supersedes: "agent write scopes are prompt rules; check them with `git status` after the run" (2026-09-29) — for the read-only agents only.
Do rely on `.claude/hooks/readonly-bash.mjs` (frontmatter `PreToolUse` on Bash) for researcher, planner, architecture-reviewer and plan-verifier; still run `git status --short` after writing agents.
Why: it exits 2 on redirects, `sed -i`, rm/mv/cp, state-changing git, installs, db/baseline scripts and interpreters; it is a denylist, not a sandbox, and path scopes for writers remain prompt-only. Evidence: `node .claude/hooks/readonly-bash.test.mjs` (13 allowed, 26 blocked).

### 2026-10-07 — plan-verifier can't run `node --test`; plans must say `Status: ready`
Do run a run's `node …` green-check (pr-self-review self-tests) in the calling session; set a plan's header to `Status: ready`, not `approved`.
Why: `readonly-bash.mjs` blocks every interpreter call, so plan-verifier reports such checks as "cannot verify"; planner/implementer/plan-verifier key on the literal `ready` (`.claude/agents/planner.md:146`). Evidence: R0 of `specs/plans/2026-10-07-l04-mcp-server.plan.md`.

### 2026-10-11 — a writer's path scope CAN be enforced: `PreToolUse` hook on `Write|Edit`
Supersedes: "read-only agents: Bash writes are blocked by a hook, write scopes still aren't" (2026-09-30) — for spec-creator only.
Do enforce a writing agent's path scope with a frontmatter hook (matcher `Write|Edit`) that checks `tool_input.file_path`; pair it with `readonly-bash.mjs` on Bash, or Bash writes around it.
Why: no path-scoped `Write` in `tools`, but the hook gets the target path and blocks with exit 2. It must resolve real paths, because a symlinked folder otherwise escapes. Evidence: `.claude/hooks/spec-write-scope.mjs`, `node .claude/hooks/spec-write-scope.test.mjs` (6 allowed, 15 blocked).

### 2026-10-11 — subagents can't ask the user: choices go out in the report, the main session asks
Do put every user decision a subagent needs (questions, recommendations, implementation-planner's multi-agent / single-agent choice) in its report as `### Qn · header: …` with 2–4 options, recommended first; the main session asks via AskUserQuestion and resumes it with `Round N answers:` via SendMessage.
Why: subagents have no AskUserQuestion, and the plan's `Execution:` line stays `ask-user` until the main session fills it in. The agent formerly named `planner` is now `implementation-planner` (older entries cite `planner.md`). Evidence: `.claude/agents/implementation-planner.md` ("Execution mode", "Step 6"), `.claude/agents/spec-creator.md` ("Step 6").

### 2026-10-11 — read-only agents may run `scripts/check.sh` and `node --test <files>`
Supersedes: "plan-verifier can't run `node --test`; plans must say `Status: ready`" (2026-10-07) — the `node --test` part only; `Status: ready` still holds.
Do let plan-verifier / correctness-reviewer verify with `./scripts/check.sh` and `node --test <files>`; any other `node …` is still blocked → "cannot verify".
Why: `readonly-bash.mjs` now allows exactly those two (no flags after `--test`, no redirect); everything else stays a denylist. Evidence: `node .claude/hooks/readonly-bash.test.mjs` (23 allowed, 55 blocked).

### 2026-10-11 — spec-creator can't edit specs inside a git worktree
NEVER run spec work for spec-creator in a worktree; keep it in the main clone (or a session started inside the worktree).
Why: `spec-write-scope.mjs` resolves allowed paths against `$CLAUDE_PROJECT_DIR`, so `/home/nazar/dev-digest-retro/specs/…` was blocked as "outside the repo" — this also answers the open question: the `Write|Edit` frontmatter hook does fire in a live spec-creator run. Evidence: L05 round 3 on PR #32 (edits applied by the main session, commit 520a8f3).

## Tool & Library Notes

### 2026-09-29 — subagent `disallowedTools: Bash(git push *)` removes ALL of Bash
NEVER restrict single commands via a specifier in agent `tools`/`disallowedTools`; use prompt rules, `permissions.deny` or a `PreToolUse` hook.
Why: code.claude.com/docs/en/sub-agents says a specifier entry "still removes the whole tool" (its own example contradicts
this). Also: `skills:` preload rejects skills with `disable-model-invocation: true` (e.g. `pr-self-review`).

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

### 2026-09-27 — `corepack pnpm add <pkg>` churns unrelated lockfile entries
NEVER add a dependency with corepack's pnpm 12 without reading the lockfile diff; revert if it touches other packages.
Why: `add fflate` in `server/` re-resolved peers (`debug`, `testcontainers`… gained `(supports-color@7.2.0)`),
~70 lines of noise. L02 dropped the dep and read zips via `node:zlib` (`server/src/modules/skills/archive.ts`).

### 2026-09-29 — pnpm 10 is on PATH on the dev machine now
Supersedes: "pnpm isn't on PATH; `corepack pnpm` leaves a stray file" (2026-09-27)
Use plain `pnpm <cmd>`; fall back to the corepack recipe only when `which pnpm` finds nothing.
Why: nvm's Node 24 ships pnpm 10.34.5 (matches "pnpm ≥10"), no stray `pnpm-workspace.yaml`. Evidence: `which pnpm` →
`~/.nvm/versions/node/v24.13.1/bin/pnpm`, `pnpm -v` → 10.34.5.

### 2026-10-11 — server and reviewer-core `typecheck` skip test files
NEVER take a green `pnpm typecheck` (server) / `npm run typecheck` (reviewer-core) as proof that tests type-check.
Why: both tsconfigs `include` only `src/**/*.ts` and vitest strips types, so a type error in a test passes both (client and mcp include their tests). Evidence: `server/tsconfig.json` include; a test with `const x: number = 'a'` passed `./scripts/check.sh --related`.

### 2026-10-11 — Claude auto mode denies edits to `.claude/hooks/*` as self-modification
Do ask the user to apply or approve changes to the agent guard hooks (`readonly-bash.mjs`, `spec-write-scope.mjs`); don't route around the denial.
Why: the auto-mode classifier blocked an edit to `readonly-bash.mjs` with "[Self-Modification]"; agent prompts and skills were editable. Evidence: chore/sdd-workflow session.

### 2026-10-11 — the snap `mmdc` can't render Mermaid on this machine
Do treat doc-writer's "not rendered (mmdc exit 1)" as unverified, not broken; check diagrams by eye or on GitHub.
Why: snap confinement — a file path gives "Input file doesn't exist", stdin input fails at startup, even for diagrams already in the repo. Evidence: L05 doc-writer run (`/snap/mermaid-cli/25/…/index.js:260`).

### 2026-10-20 — `git mv` plus merging more code into the moved file drops the rename
Do commit the pure `git mv` separately when history matters; a moved file that gains more than its own size is recorded as add + delete.
Why: rename detection needs ≥ 50 % similarity; `git status` still shows `RM` (index), but `git diff HEAD -M --stat` and the commit show `A` + `D`, so `--follow` stops. Evidence: `reviews/smart-diff/classify.ts` → `server/src/modules/_shared/file-roles.ts` with `CLASSIFY_RULES` merged in (L05 brief R1; accepted).

## Recurring Errors & Fixes

### 2026-09-27 — `ERR_PNPM_IGNORED_BUILDS` on install in a fresh git worktree
Run `corepack pnpm install --frozen-lockfile --config.strict-dep-builds=false` (then delete `pnpm-workspace.yaml`).
Why: pnpm 12 fails on unapproved build scripts (esbuild, ssh2, protobufjs…); without the flag nothing
usable is linked. The binaries work without those scripts: tsc/vitest/next/drizzle-kit all ran in the worktree.

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
2026-09-27 — L02 skills (server+client+docs, worktree feat/l02-skills): 2 entries (pnpm add churn, IGNORED_BUILDS); +1 in client/INSIGHTS.md.
2026-09-29 — planner + implementer subagents (.claude/agents, specs/plans): 2 entries (routing.md as shared skill map, Bash specifier removes whole tool).
2026-09-29 — test-writer / architecture-reviewer / plan-verifier / doc-writer agents + docs map (worktree chore/review-test-doc-agents): 2 entries (prompt-only write scopes, pnpm on PATH); +1 in client/INSIGHTS.md.
2026-09-30 — Intent Layer (server+reviewer-core+client, feat/intent-layer) + read-only agent hook: 1 entry (hook vs prompt-only scopes); +3 in server/INSIGHTS.md, +1 in client/INSIGHTS.md.
2026-10-07 — L04 devdigest-mcp research + spec (feat/l04-mcp-server): 0 entries (MCP token findings live in specs/L04-mcp-server.md).
2026-10-07 — L04 R0: pr-self-review/agents learn the mcp package (feat/l04-mcp-server): 1 entry (verifier can't run node; plan Status ready).
2026-10-10 — L04 Blast Radius (server+client+mcp, feat/l04-blast-radius): 0 entries here; +3 in server/INSIGHTS.md, +1 in client/INSIGHTS.md, +1 in mcp/INSIGHTS.md.
2026-10-11 — spec-creator agent + spec-write-scope hook (feat/spec-creator-agent): 1 entry (hook-enforced write scope) + 1 open question.
2026-10-11 — PR #29 review fixes (Copilot + DevDigest): 1 entry (hook guards: resulting file, flag-writers, fail-open).
2026-10-11 — PR #29 Copilot round 2: 1 entry (git allowlist, -c/GIT_* exec).
2026-10-11 — PR #29 Copilot round 3: 0 entries (wrapper options `env -i`, anchored Status field — same class as the entries above).

2026-10-11 — planner → implementation-planner (no spec work, requirements review, execution-mode question; feat/implementation-planner-agent): 1 entry (subagent choices via the main session).
2026-10-11 — SDD workflow audit: correctness-reviewer, sdd-run skill, scripts/check.sh (worktree chore/sdd-workflow): 3 entries (check cost = turns not time, tests not typechecked, hooks need the user).
2026-10-20 — L05 PR Brief R1 (contract, _shared move, repoDocs, container.blast; feat/l05-pr-brief): 1 entry (git mv + merge drops rename); +1 in server/INSIGHTS.md, +1 in client/INSIGHTS.md.

## Open Questions

### 2026-10-11 — does the `Write|Edit` frontmatter hook fire inside a live spec-creator run?
Only unit + stdin tests prove `spec-write-scope.mjs`; the agent was added mid-session and never ran. First live run: ask it to write `server/src/x.md` and confirm "Blocked by spec write scope". Evidence pending.
