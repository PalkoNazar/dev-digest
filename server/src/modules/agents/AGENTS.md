# modules/agents

Reviewer agents (provider, model, system prompt, strategy, repo-intel toggle, CI gate)
+ model listing per provider.

## Rules
- Any config change bumps `version` and snapshots the config into `agent_versions`
  (immutable, used for eval reproducibility) — go through `repository.ts`, never
  update `agents` directly.
- Other modules read agents via `container.agentsRepo`.

## Gotchas
- Built-in prompts: the DB row wins at run time; `/docs/agent-prompts/*.md` and
  `server/src/db/seed-prompts.ts` only matter for fresh seeds — keep all three in sync.
- `/agents/:id/skills` (L02): the ordered link set with a per-agent `enabled`. A skill reaches
  the prompt only if linked ∧ link-enabled ∧ `skills.enabled`; a change of that effective
  set bumps the agent version (`setSkillLinks`).
