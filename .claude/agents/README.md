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
| [implementer](implementer.md) | Executes an approved plan (or one run of it) in client / server / reviewer-core, runs the package checks, self-checks only its own diff | `inherit` | yes | plan (+ run id) or gap list → code, tests, implementation report |
| [test-writer](test-writer.md) | Writes and runs tests in three modes — TESTS-FIRST from a plan, COVER for existing code, REPRO for a bug — across client / server / reviewer-core | `inherit` | tests only | plan steps / targets / bug → test files + test report |
| [architecture-reviewer](architecture-reviewer.md) | Two-tier layer review: dependency-cruiser as ground truth, judged skill rules on top; every finding with evidence | `opus`, effort `high` | no | diff or paths → architecture review |
| [plan-verifier](plan-verifier.md) | Traceability of the diff against every item of one plan, plus a reverse scan for unplanned changes; gaps only | `opus`, effort `high` | no | plan (+ run) + diff → verification report |
| [doc-writer](doc-writer.md) | Documents implemented features, grounded in file paths, with Mermaid diagrams, placed via the `docs/README.md` map | `sonnet` | docs only | implemented feature or topic → docs + docs report |

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
     ├──► test-writer (optional, TESTS-FIRST) ──► red tests  (never committed alone)
     ├──► implementer ──► code + tests + report
     ├──► plan-verifier ∥ architecture-reviewer   (read-only, in parallel)
     │         │
     │         └── gaps / findings ──► implementer or test-writer ──► re-verify
     │
     ├──► main session: /engineering-insights → commit → next run
     │
     ├──► after the last run: doc-writer ──► docs ──► commit
     │
     └──► before push: the user runs /pr-self-review (security review lives there)
```

One file → skill map drives plan, implementation and review:
[`../skills/pr-self-review/references/routing.md`](../skills/pr-self-review/references/routing.md).
The planner assigns skills per step from it, the implementer and test-writer load
skills from it, `/pr-self-review` reviews with it. Change skill routing there, not in
agent prompts. architecture-reviewer grades with the same
[`severity.md`](../skills/pr-self-review/references/severity.md) as `/pr-self-review`.

## Permissions

| Agent | Allowed tools | Denied tools | Preloaded skills | Also in the prompt |
|---|---|---|---|---|
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | — (allowlist) | — | read-only Bash only; no skills, no sub-agents; never reads secrets |
| planner | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture, zod | read-only Bash only; unknown facts → "Needs research"; no `engineering-insights`; `maxTurns: 40` |
| implementer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture, zod | no commit/push/stash/PR; no hand-edited migrations; never weakens `groundFindings`/`INJECTION_GUARD`; no secrets; no `INSIGHTS.md` edits; never edits test-writer's tests; `maxTurns: 120` |
| test-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch | onion-architecture, react-testing-library | writes only test paths; never deletes/skips/weakens existing tests; no new deps; local pattern beats generic skill; no commit/push; `maxTurns: 80` |
| architecture-reviewer | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture | read-only Bash + `pnpm arch:check`/`depcruise` only; never `arch:baseline`; evidence or drop; `maxTurns: 40` |
| plan-verifier | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | — | runs only the plan's own commands; no migrations, e2e, installs, snapshot updates; self-skipped test = cannot verify; `maxTurns: 60` |
| doc-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch, NotebookEdit | mermaid-diagram | writes only docs paths; implemented-only; location from the docs map; `mmdc` render check; no commit/push; `maxTurns: 60` |

Command-level bans (`git push`, `docker compose down -v`, …) and write scopes ("only
test files", "only docs") are prompt rules, not `disallowedTools` entries: a specifier
like `Bash(git push *)` removes the whole Bash tool from a subagent, and there is no
path-scoped Write. plan-verifier's reverse scan and `git status --short` after every
writing-agent run catch scope breaks. No `permissionMode` is set — it is ignored while
the main session runs in auto / acceptEdits mode.

## Artifacts

| Artifact | Produced by | Consumed by | Where |
|---|---|---|---|
| Research report (TL;DR, findings + evidence, not-found list) | researcher | main session, planner (via "Needs research") | conversation |
| Development Plan (Goal, Context read, Constraints, Affected modules, Steps with Skills / Tests / Done when, **Runs**, Verification, Acceptance criteria, Risks, Out of scope, Needs research, INSIGHTS discrepancies, Open questions) | planner | user (approval), implementer, test-writer, plan-verifier | `specs/plans/YYYY-MM-DD-<slug>.plan.md` — see [`specs/plans/README.md`](../../specs/plans/README.md) |
| Implementation report (Status DONE / PARTIAL / BLOCKED, steps, files, skills applied, checks with exit codes, deviations, not done, for reviewers, insight candidates) | implementer | main session, reviewers | conversation |
| Test report (Status GREEN / RED-BY-DESIGN / BUG-FOUND / BLOCKED, cases traced to plan items, checks, suspect tests, needs production change) | test-writer | main session, implementer | conversation |
| Architecture review (Status CLEAN / FINDINGS / INCOMPLETE / NO-CHANGES, Tier A ground truth, findings with severity + evidence, pre-existing FYI) | architecture-reviewer | main session, implementer | conversation |
| Verification report (Status VERIFIED / GAPS / CANNOT-VERIFY, traceability matrix, unplanned changes, gaps to fix, plan issues) | plan-verifier | main session, implementer, test-writer, planner (plan issues) | conversation |
| Docs + docs report (docs written, claims → evidence, diagrams rendered, not documented, stale docs) | doc-writer | user | `docs/`, `<pkg>/docs/`, READMEs per [`docs/README.md`](../../docs/README.md) "Where docs go" |
| Insight candidates / INSIGHTS discrepancies | every agent | main session → `/engineering-insights` | the package `INSIGHTS.md` |

## Sources behind the agents

Checked 2026-09-29 (Claude Code 2.1.284). Repo rules (architecture, Do-not-touch,
branches) come from `CLAUDE.md` and the package `AGENTS.md` files, not from these.

| Rule in the agents | Source |
|---|---|
| Least-privilege tool allowlists; read-only planner, researcher and reviewers; `disallowedTools: Agent` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
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
| No path-scoped Write → write scopes are prompt rules; `disallowedTools` applied before `tools`; read-only = Read, Grep, Glob (+ read-only Bash) | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Combined agent descriptions stay well under ~15k tokens | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| Writer / reviewer separation; tests-first ("have one Claude write tests, then another write code to pass them") | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| plan-verifier's core loop ("review the diff against PLAN.md … Report gaps, not style preferences") | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Reviewers over-report → flag only gaps that affect correctness or the stated requirements | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| Failing test that reproduces the issue; run single tests first | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| test-writer: match existing test style; cover error conditions, boundaries, unexpected inputs; run the new tests | [Common workflows](https://code.claude.com/docs/en/common-workflows) |
| test-writer: no hard-coding for tests; tests verify, not define; report wrong tests, never remove or edit them | [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), [reward hacking research](https://www.anthropic.com/research/emergent-misalignment-reward-hacking) |
| Query priority role > label > text > testId; test what the user sees | [Guiding principles](https://testing-library.com/docs/guiding-principles/), [query priority](https://testing-library.com/docs/queries/about/#priority) |
| user-event is preferred, but not installed here → `fireEvent`, per local pattern | [user-event intro](https://testing-library.com/docs/user-event/intro), `client/package.json` |
| Routes via `app.inject`, no `listen` | [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) |
| `vi.mock` hoisting, restore mocks between tests, DI over module mocks | [Vitest v2 mocking](https://v2.vitest.dev/guide/mocking) |
| architecture-reviewer: deterministic tier (dependency-cruiser) as ground truth; evaluator–optimizer loop | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) |
| Dependency rule: code depends only on more central layers | [Palermo, Onion](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [Cockburn, Hexagonal](https://alistair.cockburn.us/hexagonal-architecture/) |
| `arch:check` as an architecture fitness function | [Thoughtworks Radar](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function) |
| Rubric, reason then verdict, code-based checks first | [Develop tests](https://platform.claude.com/docs/en/docs/test-and-evaluate/develop-tests) |
| "Cannot verify" allowed; quote evidence; retract unsupported claims | [Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) |
| plan-verifier: verification (built as planned), not validation (right plan) | [Software V&V](https://en.wikipedia.org/wiki/Software_verification_and_validation) |
| Traceability matrix (one row per item) + reverse scan | [Requirements traceability](https://en.wikipedia.org/wiki/Requirements_traceability) |
| Severity labels; explain the reasoning | [Google review comments](https://google.github.io/eng-practices/review/reviewer/comments.html), [what to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html) |
| doc-writer: one Diátaxis type per doc; the compass to classify | [Diátaxis](https://diataxis.fr/), [compass](https://diataxis.fr/compass/) |
| Docs as code; docs change in the same change as code; small and fresh beats big and stale | [Write the Docs](https://www.writethedocs.org/guide/docs-as-code/), [Google doc best practices](https://google.github.io/styleguide/docguide/best_practices.html) |
| Doc style (second person, active voice, sentence-case headings) | [Google style highlights](https://developers.google.com/style/highlights) |
| Decision records only for real decisions (context · decision · consequences) | [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html), [adr.github.io](https://adr.github.io/) |
| doc-writer: Mermaid renders natively on GitHub; syntax pitfalls (`end`, special characters) | [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams), [Mermaid syntax](https://mermaid.js.org/intro/syntax-reference.html) |
| C4 levels 1–2 are enough; Mermaid C4 is experimental → draw them as flowcharts | [C4 model](https://c4model.com/), [Mermaid C4](https://mermaid.js.org/syntax/c4.html) |

Our own decisions (no external source): model choices, the run-splitting threshold
(> ~5 steps or > 1 package), the shared `routing.md`, insights recorded only by the
main session, the verdict vocabulary met / partial / not met / cannot verify (inferred
from the traceability and hallucination sources), the Tier A / Tier B split, the ≤ 1000-character cap per `description` (short triggers delegate
better; all seven together are ~1.2k tokens), reuse of
`severity.md` by architecture-reviewer, the "Where docs go" map in `docs/README.md`,
and committing RED-BY-DESIGN tests only together with the implementer run that turns
them green.

## Adding an agent

1. One responsibility, one concrete trigger in `description` (≤ 1000 characters — our own
   cap; the docs only limit all descriptions together to ~15k tokens).
2. Smallest tool allowlist that does the job; deny `Agent` unless it must delegate.
3. A fixed output format the caller can act on, and a clarification path for vague input.
4. Add a row to every table above.
5. State how it hands insights back: Insight candidates and/or INSIGHTS discrepancies.
