# Skills for the L02 agents

Reusable review instructions for the two agents added in L02. A skill is **text +
config only** (name, directive description, type, markdown body) — see
`specs/L02-skills.md`. These files are sources to bring into DevDigest through the UI;
the DB is the source of truth once a skill is saved.

| Skill | Type | Agent | How to add it |
|---|---|---|---|
| `branch-coverage` | rubric | Test Quality Reviewer | **Create** — Skills → Add skill → Create, paste name/description/body |
| `corner-cases` | rubric | Test Quality Reviewer | **Create** |
| `mocking-discipline` | convention | Test Quality Reviewer | **Import** `.md` — Add skill → Import → `mocking-discipline/SKILL.md` |
| `flaky-test-hunter` | rubric | Test Quality Reviewer | **Import** `.zip` — `flaky-test-hunter.zip` (shows ignored `scripts/`, `references/`) |
| `route-breaking-change` | rubric | API Contract Reviewer | **Create** |
| `shared-contract-sync` | convention | API Contract Reviewer | **Import** `.md` |

Then open **Agents → <agent> → Skills**, attach the skills, keep them ticked and order
them (earlier = earlier in the prompt). Imported skills are saved **disabled**: read the
body, then enable it on the Skills page.

## Why the imports

`flaky-test-hunter.zip` is a Claude-style skill folder: `SKILL.md` plus a
`scripts/find-flaky.sh` and a `references/` note. On import DevDigest reads only
`SKILL.md`; the preview lists the other entries as ignored — they are never
extracted, written to disk or executed. The body still *mentions* the script: the
preview warns that the agent will only ever see the text.

A skill from someone else is someone else's instructions inside your agent's prompt.
It can steer the review, relax it ("don't flag X") or smuggle in an agenda. Preview →
read → enable, never the other way round.

## Rebuilding the zip

```bash
cd docs/skills && rm -f flaky-test-hunter.zip && zip -r flaky-test-hunter.zip flaky-test-hunter
```

## Writing a good description

The description is the skill's interface — it is rendered right under the skill's name
in the prompt, so write it as a **directive**: *when* it applies and *what* the agent
must do. "When a diff changes an HTTP route, report every breaking change as CRITICAL"
beats "API breaking changes".
