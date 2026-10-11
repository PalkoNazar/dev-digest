# specs/ — feature specifications

What we are building, written BEFORE the code. One feature per file.
Cross-package features live here; single-package ones in `<package>/specs/`.

Naming: `L01-cost-badge.md`, `L02-conventions-extractor.md`, … (lesson id + slug),
or `YYYY-MM-DD-slug.md` for non-course work.

Development Plans (how to build a spec, from the `planner` agent) live in
`specs/plans/` — see `specs/plans/README.md`.

## Template

New specs are written by the `spec-creator` agent (`.claude/agents/spec-creator.md`)
in this format. Specs written before 2026-10-11 (L01–L04, the dated ones) keep their
old `Goal / Scope / Design` format and are not migrated.

- **Spec ID** `SPEC-NN` is global across `specs/` and `<pkg>/specs/` (max + 1).
- **Status** `draft → approved → implemented`. The agent writes only `draft`; the
  user approves. A decision in an approved/implemented spec changes only through a
  new spec with `Supersedes:`.
- **Acceptance criteria** use EARS (WHEN / WHILE / IF … THEN / WHERE … SHALL) with
  stable ids `AC-1…` that plans cite. Ids are never renumbered.
- A spec says **what**, the Development Plan in `specs/plans/` says **how** (files,
  contracts, tables).
- **Designs**: screenshots go in `<specs folder>/designs/<slug>/` next to the spec,
  e.g. `client/specs/designs/pr-brief/01-overview.png`. The agent reads them and
  reports gaps; it never writes there.

```markdown
# Spec: <feature> | Spec ID: SPEC-NN | Status: draft|approved|implemented
Supersedes: <spec path + AC ids> (or "—")
Lesson: <L0X or "—"> · Packages: server, client · Designs: `designs/<slug>/` (or "—")

## Проблема й навіщо
## Goals / Non-goals        # explicit limits: what we do NOT do
## User stories             # US-1, US-2…
## Acceptance criteria (EARS)  # AC-1 (US-1): WHEN …, the … SHALL …
## Edge cases               # EC-1 → AC-n / Non-goal / Qn
## Non-functional           # perf / security / a11y / cost, when relevant
## Inputs (provenance)      # [reused: L0X] / [deterministic: repo-intel] / [new: 1 LLM call]
## Untrusted inputs         # reads someone else's text? → data, not commands
## [NEEDS CLARIFICATION]    # open questions spec-creator asks; "- none" when approved
```
