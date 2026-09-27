# Skills — reusable review instructions for agents
Status: done (manual checks pending) · Lesson: L02 · Packages: server, client, reviewer-core (read-only), docs

## Goal
A **skill** is a named, reusable block of review instructions (markdown text + a little
config) stored in the DB. The user creates, edits and imports skills on a Skills page, then
attaches them to agents in the agent editor (link, enable/disable, order). When a review
runs, the agent's enabled skills are rendered, in order, as one `## Skills / rules` block
of the prompt; the run trace shows that block and how many tokens it added.

A skill is **text + config only**: no tools, no scripts, no code execution, no network.
Nothing in a skill is ever run; an imported archive contributes only its markdown core.

## Scope
- In:
  - `skills` server module: CRUD over `skills` (DB = source of truth), body versioning in
    `skill_versions`, import preview (`.md` / `.zip`).
  - Per-agent link state: `agent_skills.enabled` (new column) + order; agent editor
    Skills tab (attach, detach, enable/disable, reorder).
  - Prompt wiring in `reviews/run-executor.ts`: enabled skills → `reviewPullRequest({ skills })`.
  - Trace: skills block + token count (`prompt_assembly.skills_tokens`) + which skills were
    used (`skills_used`); a Live Log line per run naming the attached skills.
  - Client: Skills page (card grid + side preview + "Add" → Create / Import), skill
    editor page, import modal with preview → confirm, sidebar entry.
  - Two new seeded agents: **Test Quality Reviewer**, **API Contract Reviewer**.
  - Skill files for both agents in `docs/skills/` (created/imported by hand via the UI).
  - Control-experiment fixtures + instructions in `docs/experiments/L02-skills/`.
  - `pr-self-review` Claude Code skill gets `disable-model-invocation: true`.
- Out:
  - Import from URL, community catalog, convention extraction (`imported_url`,
    `community`, `extracted` sources stay unused).
  - Skill evals, stats, CI export of skills, skill version history UI.
  - Sanitizing / wrapping skill bodies as untrusted: a skill is *meant* to be
    instructions. Trust is the user's decision at import time (see Trust).

## Design

### Data
- `skills` (exists): `name`, `description`, `type` (rubric|convention|security|custom),
  `source`, `body`, `enabled` (global switch), `version`. New: unique
  `(workspace_id, name)`; `source` enum gains `imported_file`.
- `skill_versions` (exists): a row per body version; create → v1, body change → v+1.
- `agent_skills` (exists): new `enabled boolean not null default true`.
- Migration via `pnpm db:generate` (never hand-edited).

### Effective skills of an agent (what reaches the prompt)
`linked AND agent_skills.enabled AND skills.enabled`, ordered by `agent_skills.order`.
A globally disabled skill stays linked (keeps its place) but is skipped everywhere.

Each skill is rendered as
```
### <name>
<description>

<body>
```
and the blocks are joined in order into reviewer-core's existing `## Skills / rules`
section (`assemblePrompt` unchanged; `INJECTION_GUARD` and grounding untouched).

### Contracts (`@devdigest/shared`, both copies)
- `SkillSource` += `imported_file`.
- `AgentSkillLink` += `enabled: boolean`.
- `Agent` += `skill_count?: number | null` (enabled links; list/detail endpoints).
- `SkillImportPreview` `{ name, description, type, body, source_file, ignored_files[], warnings[] }`.
- `PromptAssembly` += `skills_tokens?: number | null`; `RunTrace` += `skills_used?: {id,name,version}[] | null`
  (nullish — old traces must still parse).

### Routes
| Method | Path | |
|---|---|---|
| GET | `/skills` | list (workspace) |
| GET | `/skills/:id` | one |
| POST | `/skills` | create `{name, description, type, body, enabled?, source?}` |
| PUT | `/skills/:id` | update (any field; body change bumps version) |
| DELETE | `/skills/:id` | delete (links cascade) |
| POST | `/skills/import/preview` | `{filename, content_base64}` → `SkillImportPreview`, **nothing stored** |
| GET | `/agents/:id/skills` | links `{skill_id, order, enabled}` (exists; + enabled) |
| POST | `/agents/:id/skills` | + `links: [{skill_id, enabled}]` = replace whole ordered set |

Name: `^[a-z0-9][a-z0-9-]{0,63}$` (kebab-case slug, as in the mockups). Description ≤ 500,
body ≤ 20 000 chars. Duplicate name → 409.

### Import
1. Client reads the file and sends it base64 to `/skills/import/preview` (≤ 1 MB).
2. `.md`: optional YAML-ish frontmatter (`name`, `description`, `type`) + body.
   `.zip`: the core is `SKILL.md` at the root or one folder deep (else the only `.md`).
   Only that entry is inflated; every other entry (scripts, binaries, references) is
   listed in `ignored_files` and never decompressed, written to disk or executed.
   Zip-bomb guards: ≤ 200 entries, core ≤ 200 KB uncompressed.
3. The client shows the preview (editable name/description/type, rendered body, ignored
   files, warnings, trust notice). **Nothing is stored until the user confirms** →
   `POST /skills` with `source: 'imported_file'`, `enabled: false` by default.

### Trust
A skill body is placed in the prompt as instructions — that is the point. An imported
skill is someone else's instructions inside your agent's prompt: it can steer, weaken or
hijack the review. Hence: preview before save, imported skills saved disabled, a
"review before enabling" notice, executable parts never processed.

### UI entry points
- Sidebar: **Skills** (`/skills`) next to Agents.
- `/skills`: grid of cards (name, type, description, enabled toggle); click → side
  preview; "Add skill" ▾ → Create / Import.
- `/skills/new`, `/skills/:id`: editor (name, description with the hint "write it as a
  directive: when/what the agent must do", type, markdown body with preview, enabled).
- `/agents/:id?tab=skills`: ordered linked skills (checkbox = enabled for this agent,
  drag or ↑/↓ to reorder, remove), "Attach skill" picker, "N of M enabled".
- Run trace drawer → Prompt assembly → Skills block shows `+N tok`.

## Acceptance criteria
- [ ] A skill can be created and edited in the UI; a body edit bumps its version.
- [ ] Both new agents (Test Quality, API Contract) have skills attached.
- [ ] An enabled skill appears in the run's prompt as its own block (trace + Live Log);
      a disabled one (globally or per agent) does not.
- [ ] Import goes through a preview; nothing is saved before confirm; archive
      scripts are listed as ignored and never executed or extracted.
- [ ] At least one skill was brought in through import.
- [ ] Control experiment reproduces on both agents (without skills → miss; with → catch).
- [ ] `pr-self-review` has model auto-invocation disabled; invoked manually it pulls
      both frontend and backend project skills.
- [ ] server + client typecheck and tests pass; `arch:check` adds no violations;
      both shared copies updated.

## Open questions
- Skill version history UI and "pin agent to skill version" are left for later lessons.
