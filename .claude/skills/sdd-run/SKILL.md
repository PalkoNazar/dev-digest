---
name: sdd-run
description: "Executes an approved DevDigest Development Plan (specs/plans/*.plan.md) end to end as the orchestrating main session: picks the worktree, then per run test-writer (TESTS-FIRST) → implementer → plan-verifier ∥ architecture-reviewer ∥ correctness-reviewer → fix rounds (max 2) → checks → /engineering-insights → commit; after the last run a whole-branch verification, a smoke check and doc-writer. Use when the user says 'execute / run / implement the plan', 'виконай план', 'реалізуй план', starts a new chat with a plan path, or types /sdd-run <plan> [R1|all]. Not for writing specs (spec-creator) or plans (implementation-planner)."
metadata:
  version: 1.0.0
  updated: 2026-10-11
---

# SDD run — execute a plan with the agents

You are the **orchestrator**. Agents do the work; you route their reports, ask the
user, run the cheap deterministic checks, record insights and commit. You never edit
production code or tests yourself — a fix goes back to the agent that owns it.

```
spec-creator → implementation-planner → [this skill]
  per run:  test-writer (TESTS-FIRST, if marked) → implementer
            → plan-verifier ∥ architecture-reviewer ∥ correctness-reviewer
            → fixes (≤ 2 rounds) → check.sh → /engineering-insights → commit
  at end:   plan-verifier (all) → smoke → doc-writer → commit → user: /pr-self-review, push
```

Arguments: `<plan path>` (required) and `R<n>` | `all` (default: the first run without
a commit, see Step 0).

## Step 0 — Preconditions

1. Read the plan header. `Status` must be `ready`. `Execution:` must be
   `multi-agent` or `single-agent`; `ask-user` or missing → ask the plan's
   **Execution mode** question with AskUserQuestion and write the answer into the
   plan's header line (the plan file is the only state between chats).
2. Which runs are done: `git log --oneline main..<plan branch>` — commit subjects end
   in `(R<n>)`. Start at the first run without one.
3. **Worktree.** The user often runs two consoles on one clone. Check
   `git worktree list` and `git status --short` in the main clone. If the tree is
   dirty or another session may be working there, do the whole run in a worktree:
   `git worktree add ../dev-digest-<slug> -b <plan branch> main` (or the existing
   branch without `-b`), install deps there (`pnpm install` in server/client/mcp,
   `npm ci` in reviewer-core — `./scripts/check.sh` says which are missing), and work
   from that directory — agents run in the session's working directory. Never
   `git stash`.
4. Note the spec path from the plan header — the reviewers need it.

## Step 1 — One run (multi-agent)

Keep prompts short and self-contained: plan path, run id, the spec path and the
**sections** of earlier reports an agent needs — never paste whole reports around.

1. **Tests first.** Steps of this run with `Tests-first: yes` → one `test-writer`
   call: `Mode: TESTS-FIRST · Plan: <path> · Steps: S2, S4 · Branch: <branch>`.
   Expect `RED-BY-DESIGN`. `BLOCKED` / `needs-clarification` → ask the user. Older
   plans have no `Tests-first` field: use it for steps that cover an `IF … THEN` AC,
   an `EC-n` or a limit.
2. **Implement.** `implementer`: `Plan: <path> · Run: R<n>` + the test-writer's
   "Files changed" list (those tests are the spec). Keep its agent id — fix rounds
   go back to the same implementer via SendMessage, it still has the context.
   - `BLOCKED` → show the conflict; a plan change goes to `implementation-planner`
     (resume with the conflict), then back here.
   - `PARTIAL` → show the failing output, ask: fix round / replan / stop.
3. **Scope check.** `git status --short`: every changed file must be in the
   implementer's "Files changed". Anything else → ask before going on.
4. **Review — three agents in ONE message (parallel):**
   - `plan-verifier`: `Plan: <path> · Scope: R<n>` + the implementer's report path
     sections "Files changed", "Deviations".
   - `architecture-reviewer`: `DIFF · Base: main` + plan path + "For reviewers".
   - `correctness-reviewer`: `Plan: <path> · Spec: <path> · Scope: R<n> · Base: main`
     + "For reviewers".
5. **Triage** into one list, then route:

   | Source | What | Goes to |
   |---|---|---|
   | plan-verifier | `G<n>` hand to implementer, unplanned change | implementer |
   | plan-verifier | `G<n>` hand to test-writer | test-writer `COVER` |
   | architecture-reviewer | `A<n>` critical / major | implementer |
   | correctness-reviewer | `B<n>` major+ with confidence high/medium | test-writer `REPRO` (Scenario = the case) → implementer makes it green |
   | any | minor / nit / Optional / FYI | not fixed — listed in the run summary |
   | any | `Plan issues` | the user; a real plan gap → implementation-planner |

   A REPRO test that is green on the current code disproves the finding: drop it
   and say so. A finding the user rejects is dropped, not argued.
6. **Fix rounds — at most 2.** Send the routed items (ids + the finding text) to the
   owners. Then re-check only what was fixed: `plan-verifier` with
   `Re-verify: G1, G3` (resume it via SendMessage, or a new call with its previous
   report), `correctness-reviewer` with `Scope: <files changed by the fix>` and the
   finding ids, `architecture-reviewer` only if an `A` finding was fixed. Still open
   after round 2 → AskUserQuestion: one more round / accept as known issue (goes
   into the commit body) / stop.
7. **Checks.** Run `./scripts/check.sh` yourself (seconds; deterministic). Red →
   back to the implementer; it is never committed red (RED-BY-DESIGN tests go in the
   same commit as the code that turns them green).
8. **Insights.** Collect every agent's **Insight candidates** and **INSIGHTS
   discrepancies** and run `/engineering-insights` with them (it filters and
   de-duplicates; zero entries is fine).
9. **Commit** on the plan branch: `feat(<scope>): <run title> (R<n>)` (or `fix`/
   `chore` from the branch prefix), body = what the run delivered + accepted known
   issues, with the attribution lines. Never push, never open a PR.
10. **Run summary** to the user (short): steps done, checks, findings fixed /
    dropped / open, minor items not fixed. Ask before starting the next run only if
    something is open; otherwise continue.

## Step 1' — Single-agent mode

One `implementer` call with `Run: all runs`. Then `./scripts/check.sh` yourself and
`git status --short` against its "Files changed". Then **one** `correctness-reviewer`
over the whole branch — the cheapest guard against the bugs that otherwise surface
in PR review; route its findings as in Step 1.5–1.6. Insights → commit.

## Step 2 — After the last run

1. `plan-verifier` with `Scope: all` — the whole plan over the whole branch; catches
   a later run that broke an earlier one. Gaps → one fix round as in Step 1.6.
2. **Smoke.** The plan's `Smoke:` line under Verification (older plans: the spec's
   main user story). If the API is up (`curl -s localhost:3001/health`), do it via the
   API / the devdigest MCP tools / the `run` skill on real data; otherwise give the
   user the exact steps and wait. Never start, stop or reset Docker or the dev DB.
   A smoke failure is a finding → Step 1.5.
3. `doc-writer` with the plan path and the spec → commit `docs(<scope>): …`.
4. Set the spec's `Status: implemented` only if the user confirms.
5. Hand-off: branch name, commits, open known issues, and next steps for the user:
   `/pr-self-review`, then push and the PR themselves. If you worked in a worktree,
   offer to remove it (clean, committed) and check the branch out in the main clone.

## Stop and ask the user when

- an agent returns `BLOCKED`, `needs-clarification`, `cannot-start` or `INCOMPLETE`
  twice;
- a fix round would change a file outside the plan;
- a finding asks to change the spec's behaviour (**what**) — that's spec-creator;
- two agents contradict each other (e.g. a REPRO test vs the plan's AC).
