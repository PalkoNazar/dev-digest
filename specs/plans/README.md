# specs/plans/ — Development Plans

Output of the `planner` agent (`.claude/agents/planner.md`), approved by the user,
executed by the `implementer` agent (`.claude/agents/implementer.md`).

Naming: `YYYY-MM-DD-<slug>.plan.md`. The plan's `Branch:` line is the feature branch
the implementer works on. Skills per step come from
`.claude/skills/pr-self-review/references/routing.md` — the same table
`/pr-self-review` uses, so plan, implementation and review apply the same rules.

Flow, per run: planner → user approves → (`test-writer`, tests-first) → `implementer`
→ `plan-verifier` + `architecture-reviewer` → fixes → commit. After the last run:
`doc-writer`. Before push: `/pr-self-review` (security lives there). The full map is
in [`.claude/agents/README.md`](../../.claude/agents/README.md).
