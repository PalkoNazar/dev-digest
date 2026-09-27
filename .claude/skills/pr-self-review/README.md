# PR Self Review skill

**Version:** 1.0.0 · **Updated:** 2026-09-27 · **Scope:** the whole repo — local changes of the current branch

## Motivation

Every change goes branch → PR → review in the DevDigest app → merge. By then, mistakes that
our own skills already describe (layer breaks, a component in the wrong folder, a query
without `workspaceId`, one edited copy of `@devdigest/shared`) cost a review round.
This skill runs those skills on the branch's own diff **before** the push and blocks the
push when a critical rule is broken.

## How to use

1. Once per clone: `git config core.hooksPath .githooks`.
2. Before pushing: `/pr-self-review` in Claude Code (or "перевір зміни перед PR").
3. Fix the criticals, commit, run again (unchanged files come from the cache).
4. `git push` — the hook allows it only with a fresh PASS for the pushed commit.

Bypass, logged to `bypass.log`: `SKIP_SELF_REVIEW=1 SKIP_SELF_REVIEW_REASON="hotfix" git push`.
A false critical is silenced in code with a reason:
`// self-review-ignore: layer-violation — <why this is fine>`. It stays visible in the report.

## Files

| File | What it holds | Loaded by the agent |
|---|---|---|
| `SKILL.md` | The workflow: collect → hard checks → subagents → finalize → PR draft | Every time |
| `references/routing.md` | Skill ↔ glob table, parsed by the scripts | By the scripts; by the agent when re-routing |
| `references/severity.md` | What is critical / major / minor / nit | By every reviewer subagent |
| `references/hard-checks.md` | Deterministic checks and the commands per package | When explaining a hard-check finding |
| `references/reviewer-prompt.md` | Prompt template for one reviewer subagent | Step 3 |
| `scripts/*.mjs` | Node built-ins only (they run from a git hook in any worktree) | Executed, not read |
| `scripts/test/` | `node --test .claude/skills/pr-self-review/scripts/test/*.test.mjs` | — |
| `../../../.githooks/pre-push` | Calls `check-verdict.mjs` | — |

## Decisions

- **Only critical blocks.** Critical is a closed list (`severity.md`); style never blocks.
  A false block costs a bypass, and routine bypasses kill the gate.
- **The hook only reads a verdict.** A review takes minutes and needs an LLM; a hook must be
  fast and deterministic. The verdict is bound to the commit sha **and** the hash of the
  committed diff against the merge base, so any new commit, amend, or rebase needs a new review.
- **A dirty review never unlocks a push**, and never overwrites a clean verdict of the same sha.
- **State lives in the git common dir**, not in the working tree: shared by all worktrees
  (review in one console, push from another), nothing to `.gitignore`, nothing committable.
- **Grounding like `groundFindings`.** A reviewer finding must sit on an added line and quote
  it verbatim; otherwise it is dropped. The main agent writes reviewer replies verbatim and
  never re-grades them, so the verdict does not depend on its mood.
- **Symlinks are never followed.** Repo files are read with `O_NOFOLLOW` (`readWorkingFile`);
  a symlink contributes only its target text and is excluded from LLM review, so a link to
  `~/.devdigest/secrets.json` cannot pull outside content into the run, cache or a reviewer.
- **One subagent per skill group** (ui / backend / shared, ≤ 20 files each): each loads only
  its own skills, which keeps context small and rules from bleeding across stacks.
- **One feature per branch, any number of commits.** The `feature-mix` warning looks at
  scopes and touched areas, not at the commit count.
- **Merge is not blocked locally.** Real merge protection needs a required status check on
  GitHub, which comes with CI (`agent-runner`, L06).

## Backlog

- `INSIGHTS.md` of touched packages as extra reviewer rules.
- Spec check against `specs/L0x-*.md` (acceptance criteria, no future-lesson features).
- Size warning (> ~400 changed lines, or client + server + migrations in one branch).
- New service/route without tests → major.
- A labelled set of diffs to measure false blocks / missed criticals via `skill-creator` evals.
- Optional Claude Code `PreToolUse` hook on `gh pr create` using `check-verdict.mjs`.

## Changelog

- **1.0.0** (2026-09-27) — first version.
