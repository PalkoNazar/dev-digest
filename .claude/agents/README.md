# Agents

Project subagents for Claude Code. Each `*.md` here is one agent: YAML frontmatter
(model, tools, preloaded skills) + system prompt. This README is the map of the set —
the rules themselves live in the agent files; read those before changing behaviour.
Claude Code loads agents at session start: restart the session (or open `/agents`)
after adding or editing one.

## The set

| Agent | Responsibility | Model | Writes code? | Input → Output |
|---|---|---|---|---|
| [spec-creator](spec-creator.md) | Writes a draft feature spec (EARS AC with stable ids, edge cases, provenance, untrusted inputs), analyses design screenshots for gaps, and works in question/proposal rounds with the user | `opus`, effort `high` | specs only | feature (+ designs) → draft spec in `specs/` or `<pkg>/specs/` + questions/proposals |
| [researcher](researcher.md) | Answers one concrete question with cited evidence — REPO (code, specs, INSIGHTS, git history) or EXTERNAL (docs, changelogs, issues) | `sonnet` | no | question → research report (or clarifying questions) |
| [implementation-planner](implementation-planner.md) | Turns an approved spec (or a fix/chore task) into an implementation plan grounded in module docs, INSIGHTS, architecture rules and routed skills; reviews the requirements first (questions + recommendations) and ends with the multi-agent / single-agent question. Never writes specs | `opus`, effort `high` | no | approved spec or task → plan for `specs/plans/` (or `needs-spec` / clarifying questions) |
| [implementer](implementer.md) | Executes an approved plan (or one run of it) in client / server / reviewer-core, runs `scripts/check.sh` (`--related` per step, full per run), self-checks only its own diff | `inherit` | yes | plan (+ run id) or gap list → code, tests, implementation report |
| [test-writer](test-writer.md) | Writes and runs tests in three modes — TESTS-FIRST from a plan, COVER for existing code, REPRO for a bug — across client / server / reviewer-core | `inherit` | tests only | plan steps / targets / bug → test files + test report |
| [architecture-reviewer](architecture-reviewer.md) | Two-tier layer review: dependency-cruiser as ground truth, judged skill rules on top; every finding with evidence | `opus`, effort `high` | no | diff or paths → architecture review |
| [correctness-reviewer](correctness-reviewer.md) | Bug hunt on the diff: spec IF/THEN AC and edge cases, state over time (resync, retry), limits and budgets, outside-system failures, UI races; every finding with a failure scenario + file:line quote | `opus`, effort `high` | no | diff (+ plan, spec, run) → correctness review |
| [plan-verifier](plan-verifier.md) | Traceability of the diff against every item of one plan, plus a reverse scan for unplanned changes; gaps only; per run, `Re-verify: G…` after fixes, and `all` over the whole branch after the last run | `opus`, effort `high` | no | plan (+ run) + diff → verification report |
| [doc-writer](doc-writer.md) | Documents implemented features, grounded in file paths, with Mermaid diagrams, placed via the `docs/README.md` map | `sonnet` | docs only | implemented feature or topic → docs + docs report |

None of them spawns other agents, commits, pushes or opens PRs — the calling (main)
session orchestrates, commits and runs `/engineering-insights`. Executing a plan, the
main session follows the [`sdd-run`](../skills/sdd-run/SKILL.md) skill (`/sdd-run
<plan>`): the loop below, written as steps, with the fix-round limit and stop rules.

## Flow

```
main session ──(no approved spec)──► spec-creator ──► draft + Q/P ──► user (AskUserQuestion)
     │              ▲                                                        │
     │              └──────────── SendMessage "Round N answers" ◄────────────┘
     │         READY-FOR-APPROVAL ──► user approves ──► main session sets Status: approved
     │
main session ──(facts missing)──► researcher ──► report
     │
     ├──► implementation-planner ──► requirements review + Q/R ──► user (AskUserQuestion)
     │         ▲   (needs-spec ──► spec-creator)                            │
     │         └──────────── SendMessage "Round N answers" ◄────────────────┘
     │    ready plan + "multi-agent or single-agent?" ──► user picks ──► saved to
     │    specs/plans/YYYY-MM-DD-<slug>.plan.md with Execution: <mode>
     │                                                   │
     │    single-agent: implementer "all runs" (green per run + Verification, owns
     │                  checks) ──► check.sh ──► correctness-reviewer (whole branch)
     │                  ──► fixes ──► /engineering-insights → commit
     │                                                   │
     │    multi-agent (/sdd-run): ┌── for each run R1, R2, … ◄┘
     │    ▼
     ├──► test-writer TESTS-FIRST (steps with "Tests-first: yes") ──► red tests (never committed alone)
     ├──► implementer ──► code + tests + report
     ├──► plan-verifier ∥ architecture-reviewer ∥ correctness-reviewer   (read-only, in parallel)
     │         │
     │         └── G gaps ──► implementer / test-writer COVER
     │             A findings ──► implementer
     │             B findings ──► test-writer REPRO (red) ──► implementer (green)
     │             ──► re-verify only the fixed items · at most 2 rounds, then the user decides
     │
     ├──► main session: ./scripts/check.sh → /engineering-insights → commit "(R<n>)" → next run
     │
     ├──► after the last run: plan-verifier (all, whole branch) ──► smoke on real data
     │         ──► doc-writer ──► docs ──► commit
     │
     └──► before push: the user runs /pr-self-review (security review lives there)
```

One file → skill map drives plan, implementation and review:
[`../skills/pr-self-review/references/routing.md`](../skills/pr-self-review/references/routing.md).
The implementation-planner assigns skills per step from it, the implementer and test-writer load
skills from it, `/pr-self-review` reviews with it. Change skill routing there, not in
agent prompts. architecture-reviewer grades with the same
[`severity.md`](../skills/pr-self-review/references/severity.md) as `/pr-self-review`.

## Permissions

| Agent | Allowed tools | Denied tools | Preloaded skills | Also in the prompt |
|---|---|---|---|---|
| spec-creator | Read, Grep, Glob, Write, Edit, Bash | Agent, WebFetch, WebSearch, NotebookEdit | — | Write/Edit only `*.md` directly in `specs/`, `{client,server,reviewer-core,mcp}/specs/`, only `Status: draft` files, never writes a non-draft status (hook-enforced: `spec-write-scope.mjs`); read-only Bash (hook-enforced); approved specs change only via `Supersedes:`; WHAT not HOW; no future-lesson scope; `maxTurns: 60` |
| researcher | Read, Grep, Glob, Bash, WebSearch, WebFetch | — (allowlist) | — | read-only Bash only (hook-enforced); no skills, no sub-agents; never reads secrets |
| implementation-planner | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture, zod | no spec work (feature without approved spec → `needs-spec`); never asks the user directly (Q/R/execution mode go through the calling session); read-only Bash only (hook-enforced); unknown facts → "Needs research"; no `engineering-insights`; turn budget (~60% reading, then write; unchecked → `unverified`); batched reads; `maxTurns: 80` |
| implementer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch | — (skills loaded per file from `routing.md`) | no commit/push/stash/PR; no hand-edited migrations; never weakens `groundFindings`/`INJECTION_GUARD`; no secrets; no `INSIGHTS.md` edits; never edits test-writer's tests; `maxTurns: 120` |
| test-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch | — (skills loaded per file from `routing.md`) | writes only test paths; never deletes/skips/weakens existing tests; no new deps; local pattern beats generic skill; no commit/push; `maxTurns: 80` |
| architecture-reviewer | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | onion-architecture, frontend-ui-architecture | read-only Bash (hook-enforced) + `pnpm arch:check`/`depcruise` only; never `arch:baseline`; evidence or drop; turn budget (Tier A first, write after ~40 calls; rest → "Not checked", `INCOMPLETE`); batched reads; `maxTurns: 60` |
| correctness-reviewer | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch, Skill | — | read-only Bash (hook-enforced) + `scripts/check.sh` / one test file to settle a finding; failure scenario + quote or drop; severity per `severity.md`; changed lines only; single-user threat model; turn budget (write after ~40 calls; rest → "Not checked", `INCOMPLETE`); `maxTurns: 60` |
| plan-verifier | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, Agent, WebFetch, WebSearch | — | read-only Bash (hook-enforced); runs only the plan's own commands, `scripts/check.sh` and `node --test <files>`; no migrations, e2e, installs, snapshot updates; self-skipped test = cannot verify; step `Skills` not graded (only evidence would be a claim); `maxTurns: 60` |
| doc-writer | Read, Grep, Glob, Edit, Write, Bash, Skill | Agent, WebFetch, WebSearch, NotebookEdit | mermaid-diagram | writes only docs paths; implemented-only; location from the docs map; `mmdc` render check; no commit/push; `maxTurns: 60` |

Command-level bans (`git push`, `docker compose down -v`, …) and write scopes ("only
test files", "only docs") are prompt rules, not `disallowedTools` entries: a specifier
like `Bash(git push *)` removes the whole Bash tool from a subagent, and there is no
path-scoped Write. plan-verifier's reverse scan and `git status --short` after every
writing-agent run catch scope breaks. No `permissionMode` is set — it is ignored while
the main session runs in auto / acceptEdits mode.

The five read-only agents (researcher, implementation-planner, architecture-reviewer,
correctness-reviewer, plan-verifier) and spec-creator carry a frontmatter `PreToolUse` hook on Bash:
[`.claude/hooks/readonly-bash.mjs`](../hooks/readonly-bash.mjs). It exits 2 on
redirects into files, `sed -i`, `rm`/`mv`/`cp`/…, state-changing git, installs,
`db:*`/`arch:baseline` scripts, snapshot updates, `docker`, repo scripts, and on
interpreters/`sh -c`/`xargs` that would get around it. It is a denylist, not a
sandbox. Test it with `node .claude/hooks/readonly-bash.test.mjs`.

spec-creator is the one writing agent whose write scope is enforced, not prompt-only:
a second frontmatter `PreToolUse` hook on `Write|Edit`,
[`.claude/hooks/spec-write-scope.mjs`](../hooks/spec-write-scope.mjs), resolves the
real path (symlinks included) and exits 2 unless it is a non-README `*.md` directly
in one of the five spec folders, the existing file says `Status: draft`, and the new
content sets no other status. Test: `node .claude/hooks/spec-write-scope.test.mjs`.

## Artifacts

| Artifact | Produced by | Consumed by | Where |
|---|---|---|---|
| Spec (Spec ID, Status draft, problem, goals/non-goals, US/AC (EARS)/EC with stable ids, non-functional, inputs provenance, untrusted inputs, NEEDS CLARIFICATION) + spec report (questions, proposals, design analysis, self-check) | spec-creator | user (rounds, approval), implementation-planner, plan-verifier (via the plan's AC) | `specs/` or `<pkg>/specs/` — see [`specs/README.md`](../../specs/README.md); report in conversation |
| Research report (TL;DR, findings + evidence, not-found list) | researcher | main session, implementation-planner (via "Needs research") | conversation |
| Development Plan (Goal, Context read, **Requirements review**, **Recommendations**, Constraints, Affected modules, Steps with Skills / Tests / Done when, **Runs**, Verification, Acceptance criteria, Risks, Out of scope, Needs research, INSIGHTS discrepancies, Open questions, **Execution mode** question) | implementation-planner | user (approval, execution mode), implementer, test-writer, plan-verifier | `specs/plans/YYYY-MM-DD-<slug>.plan.md` — see [`specs/plans/README.md`](../../specs/plans/README.md) |
| Implementation report (Status DONE / PARTIAL / BLOCKED, steps, files, skills applied, checks with exit codes, deviations, not done, for reviewers, insight candidates) | implementer | main session, reviewers | conversation |
| Test report (Status GREEN / RED-BY-DESIGN / BUG-FOUND / BLOCKED, cases traced to plan items, checks, suspect tests, needs production change) | test-writer | main session, implementer | conversation |
| Architecture review (Status CLEAN / FINDINGS / INCOMPLETE / NO-CHANGES, Tier A ground truth, findings with severity + evidence, pre-existing FYI) | architecture-reviewer | main session, implementer | conversation |
| Correctness review (Status CLEAN / FINDINGS / INCOMPLETE / NO-CHANGES, B findings with scenario + evidence + hand-to, spec failure paths checked) | correctness-reviewer | main session, test-writer (REPRO), implementer | conversation |
| Verification report (Status VERIFIED / GAPS / CANNOT-VERIFY, traceability matrix, unplanned changes, gaps to fix, plan issues) | plan-verifier | main session, implementer, test-writer, implementation-planner (plan issues) | conversation |
| Docs + docs report (docs written, claims → evidence, diagrams rendered, not documented, stale docs) | doc-writer | user | `docs/`, `<pkg>/docs/`, READMEs per [`docs/README.md`](../../docs/README.md) "Where docs go" |
| Insight candidates / INSIGHTS discrepancies | every agent | main session → `/engineering-insights` | the package `INSIGHTS.md` |

## Sources behind the agents

Checked 2026-09-29 (Claude Code 2.1.284). Repo rules (architecture, Do-not-touch,
branches) come from `CLAUDE.md` and the package `AGENTS.md` files, not from these.

| Rule in the agents | Source |
|---|---|
| Least-privilege tool allowlists; read-only implementation-planner, researcher and reviewers; `disallowedTools: Agent` | [Subagents](https://code.claude.com/docs/en/sub-agents) |
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
| No path-scoped Write → write scopes are prompt rules; `disallowedTools` applied before `tools`; read-only = Read, Grep, Glob (+ read-only Bash, enforced by a frontmatter `PreToolUse` hook) | [Subagents](https://code.claude.com/docs/en/sub-agents) |
| spec-creator: EARS patterns (ubiquitous, event, state, unwanted, optional, complex) | [Mavin et al., EARS, RE'09](https://ieeexplore.ieee.org/document/5328509), [alistairmavin.com/ears](https://alistairmavin.com/ears/) |
| spec-creator: `[NEEDS CLARIFICATION]` markers instead of guessing; spec = what/why, plan = how | [GitHub Spec Kit](https://github.com/github/spec-kit) |
| A frontmatter `PreToolUse` hook sees `tool_input.file_path` for Write/Edit and blocks with exit 2 → path-scoped writes | [Hooks](https://code.claude.com/docs/en/hooks) |
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
(> ~5 steps or > 1 package), the spec / plan split (implementation-planner never
writes specs and returns `needs-spec`), the execution-mode question at the end of
every plan and its multi-agent heuristic (> 1 run, contract, schema, adapter, prompts
or guards), the shared `routing.md`, insights recorded only by the
main session, the verdict vocabulary met / partial / not met / cannot verify (inferred
from the traceability and hallucination sources), the Tier A / Tier B split, the ≤ 1000-character cap per `description` (short triggers delegate
better; all nine together are ~1.6k tokens), reuse of
`severity.md` by architecture-reviewer, the "Where docs go" map in `docs/README.md`,
and committing RED-BY-DESIGN tests only together with the implementer run that turns
them green. Added 2026-10-11 after an audit of PRs #25 and #28 (every round of Copilot
fixes was a logic bug none of the agents looked for): correctness-reviewer as the
third parallel reviewer, `Tests-first` per plan step, at most 2 fix rounds, a
whole-branch plan-verifier and a smoke check after the last run, `scripts/check.sh`
as the one check command (suites take seconds; the cost was turns and log tokens),
no preloaded skills in the writing agents, the `sdd-run` skill as the loop.

## Adding an agent

1. One responsibility, one concrete trigger in `description` (≤ 1000 characters — our own
   cap; the docs only limit all descriptions together to ~15k tokens).
2. Smallest tool allowlist that does the job; deny `Agent` unless it must delegate.
3. A fixed output format the caller can act on, and a clarification path for vague input.
4. Add a row to every table above.
5. State how it hands insights back: Insight candidates and/or INSIGHTS discrepancies.
