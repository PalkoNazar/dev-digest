# modules/skills

L02 — reusable review instructions (name, directive description, type, markdown body,
global `enabled`). Spec: `specs/L02-skills.md`. The agent side (link, order, per-agent
enable) lives in `modules/agents`; rendering into the prompt in `reviews/run-executor.ts`.

## Rules
- A skill is text + config only. Nothing in it is executed; there is no tool/script field.
- A body change bumps `version` and writes `skill_versions` (repository, one transaction).
- Import = preview only (`POST /skills/import/preview`), stored on `POST /skills` after the
  user confirms; `source: 'imported_file'` starts disabled.
- From a `.zip` only `SKILL.md` (root or one folder deep, else the single `.md`) is
  inflated (`archive.ts`, capped); every other entry is listed as ignored, never read.

## Gotchas
- Names are unique per workspace (`skills_ws_name_idx`); the service returns 409 first.
- Skill bodies are NOT wrapped as untrusted — they are instructions by design. Trust is
  decided at import (preview + disabled by default), never by weakening `INJECTION_GUARD`.
