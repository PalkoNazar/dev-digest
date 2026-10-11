# docs/ — cross-package documentation

Stable "how it works" deep dives that span more than one package.
Package-specific docs live in `<package>/docs/`.

| Doc | What |
|-----|------|
| [agent-prompts/](agent-prompts/README.md) | How reviewer prompts are assembled + the canonical built-in prompts |
| [skills/](skills/README.md) | L02 skill sources imported into DevDigest through the UI (data, not docs about the code) |
| [experiments/](experiments/L02-skills/README.md) | Course walkthroughs — L02 skills control experiment |
| [improvement-plan.md](improvement-plan.md) | 2026-09-27 whole-project review and improvement plan |

Rules: one topic per file · link code by path · update the doc in the same change
that makes it wrong. Short gotchas go to `INSIGHTS.md`, not here.
One [Diátaxis](https://diataxis.fr/) type per doc (tutorial · how-to · reference ·
explanation) — link to the other types instead of mixing them in.

## Where docs go

| Content | Diátaxis type | Location | Index to update |
|---|---|---|---|
| Cross-package "how it works" | explanation | `docs/<topic>.md` | table above |
| Package deep dive | explanation | `<pkg>/docs/<topic>.md` | `<pkg>/docs/README.md` table |
| Module internals (e.g. [`repo-intel`](../server/src/modules/repo-intel/README.md)) | explanation / reference | `server/src/modules/<m>/README.md` | — |
| API map, env vars | reference | [`server/README.md`](../server/README.md) | — |
| Route map | reference | [`client/README.md`](../client/README.md) | — |
| Design system | reference | [`client/src/vendor/ui/README.md`](../client/src/vendor/ui/README.md) | — |
| Engine pipeline, public API | reference | [`reviewer-core/README.md`](../reviewer-core/README.md) | — |
| Setup and run | how-to | root [`README.md`](../README.md) · `<pkg>/README.md` · [`e2e/README.md`](../e2e/README.md) | — |
| Testing strategy | explanation | [`TESTING.md`](../TESTING.md) | — |
| Course walkthroughs | tutorial | `docs/experiments/<lesson>/` | table above |
| **Not docs** | — | reviewer prompt copies (`docs/agent-prompts/*-reviewer.md`, three-copy rule) · skill sources (`docs/skills/**`) · specs and plans (`specs/`) · gotchas (`INSIGHTS.md`) · agent instructions (`AGENTS.md`) | — |

Architecture decisions: a `## Decision` section (context · decision · consequences)
in the topic doc, written only when a real decision with alternatives was made — no
separate ADR folder until there is more than one.
