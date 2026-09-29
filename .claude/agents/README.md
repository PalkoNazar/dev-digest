# Agents

Project subagents for Claude Code. Each `*.md` here is one agent: YAML frontmatter
(model, tools, preloaded skills) + system prompt. This README is the map of the set —
the rules themselves live in the agent files; read those before changing behaviour.
Claude Code loads agents at session start: restart the session (or open `/agents`)
after adding or editing one.

## The set

| Agent | Responsibility | Model | Writes code? | Input → Output |
|---|---|---|---|---|
| [researcher](researcher.md) | Answers one concrete question with cited evidence — REPO (code, specs, INSIGHTS, git history) or EXTERNAL (docs, changelogs, issues) | `sonnet` | no | question → research report (or clarifying questions) |
| [planner](planner.md) | Turns one task into a structured Development Plan grounded in module docs, INSIGHTS, specs, architecture rules and routed skills | `opus`, effort `high` | no | task (+ spec) → plan for `specs/plans/` (or clarifying questions) |
| [implementer](implementer.md) | Executes an approved plan (or one run of it) in client / server / reviewer-core, runs the package checks, self-checks only its own diff | `inherit` | yes | plan (+ run id) → code, tests, implementation report |

None of them spawns other agents, commits, pushes or opens PRs — the calling (main)
session orchestrates, commits and runs `/engineering-insights`.

## Flow

```
main session ──(facts missing)──► researcher ──► report
     │
     ├──► planner ──► plan ──► user approves ──► saved to specs/plans/YYYY-MM-DD-<slug>.plan.md
     │                                                   │
     │    ┌──────────────── for each run R1, R2, … ◄─────┘
     │    ▼
     ├──► implementer ──► code + tests + report
     │         │
     │         └──► main session: /engineering-insights → commit → next run
     │
     └──► architecture / security review (separate agents or /pr-self-review; not these three)
```

One file → skill map drives plan, implementation and review:
[`../skills/pr-self-review/references/routing.md`](../skills/pr-self-review/references/routing.md).
The planner assigns skills per step from it, the implementer loads skills from it,
`/pr-self-review` reviews with it. Change skill routing there, not in agent prompts.

## Permissions

| Agent | Allowed tools | Denied tools | Preloaded skills | Also in the prompt |
|---|---|---|---|---|
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | — (allowlist) | — | read-only Bash only; no skills, no sub-agents; never reads secrets |
| planner | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture, zod | read-only Bash only; unknown facts → "Needs research"; no `engineering-insights`; `maxTurns: 40` |
| implementer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture, zod | no commit/push/stash/PR; no hand-edited migrations; never weakens `groundFindings`/`INJECTION_GUARD`; no secrets; no `INSIGHTS.md` edits; `maxTurns: 120` |

Command-level bans (`git push`, `docker compose down -v`, …) are prompt rules, not
`disallowedTools` entries: a specifier like `Bash(git push *)` removes the whole Bash
tool from a subagent. No `permissionMode` is set — it is ignored while the main
session runs in auto / acceptEdits mode.

## Artifacts

| Artifact | Produced by | Consumed by | Where |
|---|---|---|---|
| Research report (TL;DR, findings + evidence, not-found list) | researcher | main session, planner (via "Needs research") | conversation |
| Development Plan (Goal, Context read, Constraints, Affected modules, Steps with Skills / Tests / Done when, **Runs**, Verification, Acceptance criteria, Risks, Out of scope, Needs research, INSIGHTS discrepancies, Open questions) | planner | user (approval), implementer | `specs/plans/YYYY-MM-DD-<slug>.plan.md` — see [`specs/plans/README.md`](../../specs/plans/README.md) |
| Implementation report (Status DONE / PARTIAL / BLOCKED, steps, files, skills applied, checks with exit codes, deviations, not done, for reviewers, insight candidates) | implementer | main session, reviewers | conversation |
| Insight candidates / INSIGHTS discrepancies | implementer / planner | main session → `/engineering-insights` | the package `INSIGHTS.md` |

## Sources behind planner and implementer

Checked 2026-09-29 (Claude Code 2.1.284). Repo rules (architecture, Do-not-touch,
branches) come from `CLAUDE.md` and the package `AGENTS.md` files, not from these.

| Rule in the agents | Source |
|---|---|
| Least-privilege tool allowlists; read-only planner; `disallowedTools: Agent` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| A Bash specifier in `disallowedTools` removes the whole tool → command bans live in the prompt | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| `description` is the delegation trigger; "Use proactively …" | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| `skills:` injects full skill content → preload only 3 small skills, load the rest via `Skill`; skills with `disable-model-invocation` can't be preloaded | [Subagents](https://code.claude.com/docs/en/sub-agents), [Skills](https://code.claude.com/docs/en/skills) |
| Only name + description are in context until a skill is needed (progressive disclosure) | [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| Explore → plan → implement → commit; skip planning for a one-sentence diff | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| A plan names files and interfaces, states what is out of scope, ends with verification; plan file as the handoff | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Plan → validate → execute → verify (user approval between plan and implementer) | [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| Give the agent a check it can run and report command + output; fix root causes | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| The agent doing the work isn't the one grading it → review and insights left to others | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Orchestrator–workers: the main session delegates and synthesizes | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Stopping conditions → `maxTurns`, `BLOCKED` / `PARTIAL`, plans split into runs | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |

Our own decisions (no external source): model choices, the run-splitting threshold
(> ~5 steps or > 1 package), the shared `routing.md`, insights recorded only by the
main session.

## Adding an agent

1. One responsibility, one concrete trigger in `description`.
2. Smallest tool allowlist that does the job; deny `Agent` unless it must delegate.
3. A fixed output format the caller can act on, and a clarification path for vague input.
4. Add a row to every table above.
