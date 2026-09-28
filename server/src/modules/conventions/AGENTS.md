# modules/conventions

L02 homework — Conventions Extractor. Spec: `specs/L02-conventions-extractor.md`.
A scan (job `conventions-extract`) samples the repo in code, makes ONE structured LLM
call, then verifies every proposed rule in code before storing it. Skill creation from
accepted rules goes through the skills/agents APIs, not this module.

## Rules
- Nothing the model says is trusted: evidence must match the file text
  (`pipeline/evidence.ts`), confidence comes from measured adherence
  (`pipeline/adherence.ts`), never from the model's number when a detector worked.
- Model-written regexes go through `isSafePattern` before `codeIndex.grep` — no leading
  `-`, no nested quantifiers (the Node fallback runs them as JS RegExp).
- Repo files enter the prompt only inside `wrapUntrusted` blocks.
- Scan errors are stored via `redactSecrets` — provider errors echo API keys.
- The job is registered with `retries: 0`: a timeout must not re-run a paid call.

## Gotchas
- A re-scan deletes only `pending` candidates; accepted/rejected ones are kept and
  fed back to the prompt ("don't propose again").
- `completeScan` writes only while the scan is still `running`, so a job that
  finishes after its timeout (withTimeout doesn't cancel) can't clobber state.
- The feature model is read from the `settings` row here (not via the settings
  module — modules don't import each other).
