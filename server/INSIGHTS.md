# INSIGHTS — server

Append-only log of non-obvious things learned while working here: what surprised
us, why something broke, what the code doesn't say. Newest on top.

- Format: `## YYYY-MM-DD — short title` + 1–3 lines + file paths.
- If Claude trips over the same insight twice → promote it to a one-line Gotcha in
  the nearest `AGENTS.md` and mark the entry `(promoted)`.
- Stale entry → strike it through with a note, don't delete silently.

## 2026-09-27 — saving a key needs a cache flush (promoted)
Keys are saved in `POST /settings/test-connection`; LLM/GitHub clients are cached
in the container, so `container.invalidateSecretCaches()` must follow a write.

## 2026-09-27 — `src/prompts` is not copied by `build`
`platform/prompts.ts` reads templates relative to itself; `tsc` doesn't copy `.md`,
so `pnpm build && pnpm start` would miss `dist/prompts`. Dev (`tsx`) is fine.

---
<!-- engineering-insights: new entries go into the sections below. The rules above
     ("Newest on top", top-level ## entries) apply only to the entries above this line. -->

## What Works

### 2026-09-28 — live-check a server feature through `Container` in a script, not a 2nd API
Do drive the service from a `tsx` script (`.mts`, absolute imports into `server/src`, `new Container(loadConfig(env), db)`) against the dev DB.
Why: `buildApp` reaps every `running` agent_run on boot (`src/app.ts:81`), so a second API on another port would fail the reviews of the user's server on :3001. Evidence: the L02 conventions live scan.

## What Doesn't Work

### 2026-09-28 — NEVER store or show a raw LLM provider error
Pass provider error messages through `redactSecrets` (`src/platform/errors.ts`) before a DB write, log or UI.
Why: OpenAI's 401 echoes the key ("Incorrect API key provided: sk-or-v1****…8443") — a conventions scan stored it in `convention_scans.error`.

### 2026-09-27 — listing "core" files by name leaves holes in dependency-cruiser rules
NEVER define the module core as a filename allowlist (`service|helpers|…`); define it as `modules/**` minus `routes.ts` minus `repository*`.
Why: the allowlist silently skipped `repo-intel/pipeline/*`, which imports `Container`. Evidence: `MODULE_CORE` in `.dependency-cruiser.cjs`.

### 2026-09-27 — `withTimeout` does not cancel the work it times out
NEVER treat a `withTimeout` rejection as "the operation stopped"; the wrapped promise keeps running.
Why: it is a bare `Promise.race` (`src/platform/resilience.ts:20`), so a JobRunner retry (`src/platform/jobs.ts:65`)
can run concurrently with the timed-out attempt (e.g. two clones into one dir). Needs an AbortSignal to really stop.

### 2026-09-30 — review it-tests hit REAL GitHub/OpenRouter when the dev machine has keys
NEVER rely on "no override ⇒ ConfigError" in `buildApp` it-tests; pass `secrets: new MockSecretsProvider()` and `github: new MockGitHubClient()` for anything that runs a review.
Why: `loadConfig` points secrets at the real `~/.devdigest/secrets.json` (`src/platform/config.ts:82`), so the pre-review intent step made paid calls and `reviews.it.test.ts` flaked on `waitForPrRuns`' 10 s wait. Evidence: `pnpm exec vitest run .it.test` exit 1 → exit 0 three times after the overrides (reviews file 40 s → 3.3 s).

## Codebase Patterns

### 2026-09-30 — don't wrap best-effort pre-work in `RunLogger.step`
Do emit your own start/done lines and `redactSecrets` the error when the step's failure can carry a provider error.
Why: `step()` logs `err.message` unredacted as an `error` event, mirrored to pino and the persisted trace log. Evidence: `src/platform/run-logger.ts` `step`; `run-executor.ts` `deriveIntent` does it by hand.

## Tool & Library Notes

### 2026-09-27 — dependency-cruiser `exclude: '(^|/)dist/'` hides pnpm packages
NEVER exclude `dist/` by an unanchored pattern in `.dependency-cruiser.cjs`; cruising `src` is enough.
Why: pnpm resolves to `node_modules/.pnpm/<pkg>/…/dist/index.js`, so the exclude silently dropped p-queue/graphology edges and SDK rules never fired.

### 2026-09-27 — match banned packages as `(^|node_modules/)pkg(/|$)`
Do write package rules so they also match unresolved bare imports.
Why: reviewer-core has no `drizzle-orm` in its own `node_modules`, so the edge is `drizzle-orm` (unresolved), not `node_modules/drizzle-orm/`. Evidence: rule `reviewer-core-is-pure`.

### 2026-09-28 — `@vscode/ripgrep` has no binary under pnpm 12 → `codeIndex.grep` runs in Node
Expect `RipgrepCodeIndex.grep` to use the pure-Node fallback in dev: slow over a whole clone, and patterns run as JS `RegExp`.
Why: the rg binary comes from a postinstall that pnpm skips (IGNORED_BUILDS); before 2026-09-28 `rgPath` pointed at the missing file and every grep rejected with ENOENT. Check: `ls server/node_modules/@vscode/ripgrep/bin`.

### 2026-09-30 — `pnpm db:migrate` prints NOTICE objects that look like errors
Do ignore the `{ severity: 'NOTICE', code: '42P06' | '42P07' | '42710', … }` blocks; trust the exit code and the final "migrations applied" line.
Why: Postgres "already exists, skipping" notices for the drizzle schema, vector extension and migrations table print like a stack trace. Evidence: `cd server && pnpm db:migrate | grep -E "severity|message"` → 3× NOTICE, exit 0.

## Recurring Errors & Fixes

### 2026-09-28 — `drizzle-kit generate` hangs on "created or renamed from another column?"
Split a schema change that adds AND drops columns of one table into two generates: add (keep old columns) → generate → drop → generate.
Why: the rename prompt is interactive; `< /dev/null` just stops at it. Evidence: migrations `0014_safe_vivisector.sql` (add) + `0015_wild_psylocke.sql` (drop).

### 2026-09-28 — `pnpm arch:check` is green on main again
Supersedes: "`pnpm arch:check` is already red on main (5 errors not in the baseline)" (2026-09-27)
A red arch:check on a branch off `ee72f12` is your change. Evidence: only a new cycle (`settings/feature-models.ts` ↔ `platform/container.ts`) failed, then "no dependency violations found, 41 known".

### 2026-09-27 — "has an unsafe regular expression. Bailing out."
dependency-cruiser's safe-regex check rejects nested quantifiers like `^src/modules/[^/]+/(.+/)?x`.
Fix: use `.*` instead (`^src/modules/.*/x`), or a `{ path, pathNot }` pair.

### 2026-09-27 — `pnpm arch:check` is already red on main (5 errors not in the baseline)
Before blaming your change for an arch:check failure, check whether the `from` file is in your diff.
Why: on origin/main `2925183`, `drizzle-only-in-repositories` fires for `modules/{workspace,settings,pulls,polling}/routes.ts` and `settings/feature-models.ts`, none of them in `.dependency-cruiser-known-violations.json`. Evidence: `cd server && pnpm arch:check` → "5 errors, 36 known violations ignored".

## Session Notes

2026-09-27 — onion-architecture skill + dependency-cruiser rules (`pnpm arch:check`, 41-violation baseline): 4 entries.
2026-09-27 — whole-project review → docs/improvement-plan.md: 1 entry (withTimeout doesn't cancel).
2026-09-28 — L02 homework Conventions Extractor (server+client, worktree feat/l02-conventions-extractor): 5 entries (script live-check, provider error redaction, rg binary, drizzle-kit rename prompt, arch:check green).

## Open Questions
- 2026-09-27 — why do the 5 routes/feature-models drizzle imports sit outside the known-violations baseline? The baseline (41 → 36 known) was generated in e63c0f4; unverified whether P0-2/P0-3 or the baseline regen dropped them. Fix = move the queries into repositories, never `arch:baseline` to hide them.
