---
name: pr-self-review
description: "Local pre-PR self-review of the current branch in DevDigest: collects every open change (commits vs origin/main + staged + unstaged + untracked), routes each changed file to the matching project skills (UI skills on client files, onion/Fastify/Drizzle on backend files, security/zod everywhere), runs deterministic checks (Do-not-touch rules, secrets, shared-contract drift, typecheck/tests/arch:check), reviews the diff with one subagent per skill group, and writes a PASS/BLOCK verdict that the git pre-push hook enforces — any critical finding blocks the push. Use before every git push / opening a PR, when the pre-push hook says 'run /pr-self-review', or when the user says 'self-review', 'review my changes', 'check before PR', 'перевір зміни перед PR', or /pr-self-review."
# Manual only: the user runs /pr-self-review (or the pre-push hook asks for it);
# Claude never starts this long, multi-agent review on its own.
disable-model-invocation: true
metadata:
  version: 1.0.1
  updated: 2026-09-27
  scope: whole repo (local changes of the current branch)
---

# PR self-review

Reviews what this branch would put into a PR, before the PR exists. Only **critical**
findings block; everything else is advice. The verdict is a file the `pre-push` hook reads —
the hook never reviews anything itself.

```
collect-diff ─► hard-checks (bg) ─┐
     │                            ├─► finalize ─► verdict + report ─► PR draft
     └─► review-plan ─► subagents ┘
```

Paths below: `S=.claude/skills/pr-self-review/scripts`, run from the repo root (any worktree).

## Arguments
- `--base <ref>` — compare against this ref instead of `origin/main` (fallback `main`).
- `--staged-only` — review only what is staged. Informational: it cannot unlock a push.

## Workflow

### 1. Collect and route
```bash
node $S/collect-diff.mjs [--base <ref>] [--staged-only]
```
Prints the routing table (file → skills → groups, cached or not) and `RUN_DIR=<dir>` on the
last line — keep it. Show the user the routing table. Empty diff → say so and stop (PASS
is meaningless without changes).

### 2. Hard checks — start in the background
```bash
node $S/hard-checks.mjs --run "$RUN_DIR"
```
Run it with `run_in_background` (typecheck + tests take minutes) and go on with step 3.
Rules: `references/hard-checks.md`. Never pass `--no-commands` for a verdict you intend to
push with — it forces INCOMPLETE.

### 3. Reviewer subagents — one per batch, all in one message
```bash
node $S/review-plan.mjs --run "$RUN_DIR"
```
Prints `{root, mergeBase, batches:[{id, group, skills, files:[{path, skills}]}]}`. Files
already reviewed with identical bytes and skills are cached and not in any batch.

For **each batch**, launch one `Agent` (`subagent_type: "general-purpose"`) with the prompt
from `references/reviewer-prompt.md`, slots filled from that batch. Send all Agent calls in
**one message** so they run in parallel. No batches → skip to step 4.

When an agent returns, write its JSON reply **verbatim** to `$RUN_DIR/review-<batch id>.json`
(Write tool). If a reply is not valid JSON, extract the JSON object if it is plainly there;
otherwise leave the file out — `finalize` then marks the batch missing and the verdict
INCOMPLETE. Do not invent, edit, re-grade or drop reviewer findings yourself: grounding and
severity handling happen in `finalize`, so that the verdict is reproducible.

### 4. Finalize
Wait for the background hard checks to finish, then:
```bash
node $S/finalize.mjs --run "$RUN_DIR"
```
It grounds reviewer findings (changed line + verbatim evidence, like reviewer-core's
`groundFindings`), applies `self-review-ignore` comments, updates the cache, and writes the
verdict + `$RUN_DIR/report.md`:

| Verdict | Meaning | Push |
|---|---|---|
| `PASS` | no critical | allowed if the tree was clean and scope full |
| `BLOCK` | ≥ 1 critical | blocked |
| `INCOMPLETE` | a command was skipped (deps missing) or a reviewer batch has no result | blocked |

### 5. PR description draft
Only when the verdict is `PASS`: write `<verdict dir>/<head sha>.pr.md` (the verdict path is
the last line of the report; same dir, `.pr.md` instead of `.json`):

```markdown
<conventional-commit style title>

## Summary
- <what changed and why, 2–5 bullets, from the commits and diff>

## Risks
- <what could break; migrations, contract changes, shared copies — or "None identified">

## Test plan
- [ ] <commands run by the self-review and their result>
- [ ] <manual checks worth doing>

## Self-review
PASS · <n> major · <n> minor · <n> nit · <n> suppressed (<rule: reason>, …)
```

### 6. Report to the user
Reply briefly: verdict first, then each **critical** as `file:line — message → fix`, then a
count of the rest (full list in `report.md`), warnings in one line each, and the PR draft
path. On BLOCK, offer to fix the criticals; do not fix anything unasked. On INCOMPLETE, say
exactly what is missing (e.g. `cd client && pnpm install`).

## Rules
- **Never push, open or edit a PR.** The user does that; this skill stops at the verdict.
- Never bypass on the user's behalf. The bypass exists for the user:
  `SKIP_SELF_REVIEW=1 [SKIP_SELF_REVIEW_REASON="…"] git push` (logged to `bypass.log`).
- A false critical is fixed by a justified ignore on the line or the line above —
  `// self-review-ignore: <rule-id> — <reason>` — never by editing verdict files. A
  file-level finding (no line) accepts the comment anywhere in that file. Hard-check
  criticals for secrets, migrations, the grounding gate and failing commands cannot be ignored.
- Uncommitted changes are reviewed too, but such a verdict never unlocks a push (the hook
  compares the committed diff hash). After fixing: commit, run again — unchanged files come
  from the cache, so the second run is fast.

## Setup (once per clone)
```bash
git config core.hooksPath .githooks
```
The hook lives in `.githooks/pre-push`; it is shared by all worktrees of the clone. State
(verdicts, cache, runs, `bypass.log`) is in `$(git rev-parse --git-common-dir)/devdigest-self-review/`
— outside the working tree, shared by all worktrees, never committed.

## Files
- `references/routing.md` — skill ↔ glob table (parsed by the scripts; edit it to re-route)
- `references/severity.md` — what is critical; the reviewers' rubric
- `references/hard-checks.md` — deterministic checks and commands
- `references/reviewer-prompt.md` — the subagent prompt template
- `scripts/test/` — `node --test .claude/skills/pr-self-review/scripts/test/*.test.mjs`
