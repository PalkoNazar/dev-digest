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
- `/agents/:id/skills` routes serve the Skills lesson (L02); tables are empty now.
