# specs/plans/ — Development Plans

Output of the `implementation-planner` agent
(`.claude/agents/implementation-planner.md`), approved by the user, executed by the
`implementer` agent (`.claude/agents/implementer.md`). Feature plans are built only
from an approved spec; the planner never writes specs (that is `spec-creator`).

Naming: `YYYY-MM-DD-<slug>.plan.md`. The plan's `Branch:` line is the feature branch
the implementer works on. Skills per step come from
`.claude/skills/pr-self-review/references/routing.md` — the same table
`/pr-self-review` uses, so plan, implementation and review apply the same rules.

Flow: implementation-planner → user answers its questions / recommendations and picks
the execution mode (the plan's `Execution:` line, set by the calling session) →
- `multi-agent`, per run (the `sdd-run` skill, `/sdd-run <plan>`): `test-writer`
  TESTS-FIRST for steps marked `Tests-first: yes` → `implementer` → `plan-verifier` ∥
  `architecture-reviewer` ∥ `correctness-reviewer` → fixes (≤ 2 rounds) →
  `./scripts/check.sh` → commit `(R<n>)`; after the last run a whole-branch
  `plan-verifier`, the plan's `Smoke:` check and `doc-writer`;
- `single-agent`: one `implementer` call with `all runs` (each run's "Ends green on"
  before the next, full Verification at the end — the implementer owns the checks)
  → the calling session runs `./scripts/check.sh`, `git status --short`, one
  `correctness-reviewer` over the branch → commit.

A plan whose `Execution:` isn't exactly `multi-agent` or `single-agent` (missing,
`ask-user`, anything else) doesn't start: the implementer returns `BLOCKED`.

Before push: `/pr-self-review` (security lives there). The full map is
in [`.claude/agents/README.md`](../../.claude/agents/README.md).
