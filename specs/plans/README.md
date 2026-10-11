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
- `multi-agent`, per run: (`test-writer`, tests-first) → `implementer` →
  `plan-verifier` + `architecture-reviewer` → fixes → commit; after the last run
  `doc-writer`;
- `single-agent`: one `implementer` call with `all runs` (each run's "Ends green on"
  before the next, full Verification at the end — the implementer owns the checks)
  → the calling session reads the reported exit codes, `git status --short` → commit.

A plan with `Execution: ask-user` doesn't start: the implementer returns `BLOCKED`.

Before push: `/pr-self-review` (security lives there). The full map is
in [`.claude/agents/README.md`](../../.claude/agents/README.md).
