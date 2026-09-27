# Hard checks

Deterministic checks in `scripts/hard-checks.mjs` — no LLM, same answer every run. They
come from the root `CLAUDE.md` ("Do not touch", "Gotchas"). Keep this file and the script
in sync.

## Findings

| # | Check | Rule id | Severity | Suppressible |
|---|---|---|---|---|
| 1 | An existing `server/src/db/migrations/**/*.sql` or `*_snapshot.json` is modified, deleted or renamed | `do-not-touch` | critical | no |
| 1 | A new migration `.sql` with no change to `server/src/db/schema.ts` / `schema/**` | `do-not-touch` | critical | no |
| 2 | The diff removes more `groundFindings(` / `INJECTION_GUARD` occurrences than it adds | `do-not-touch` | critical | no |
| 3 | An added line matches a key pattern (OpenAI/Anthropic/OpenRouter `sk-…`, GitHub `ghp_…`/`github_pat_…`, AWS `AKIA…`, Slack `xox…`, PEM private key) | `secret-leak` | critical | no |
| 3 | An added line contains a value from `~/.devdigest/secrets.json` or `$OPENAI_API_KEY` etc. (≥ 16 chars) | `secret-leak` | critical | no |
| 3 | A `.env*` (not `.example`/`.sample`/`.template`) or `secrets.json` file is part of the change | `secret-leak` | critical | no |
| 4 | A `@devdigest/shared` file was identical in `server/src/vendor/shared` and `client/src/vendor/shared` at base and differs after this diff | `broken-contract` | critical | yes (anywhere in the file) |
| 4 | Only one copy of an already-drifted shared file changed | `shared-copy-one-side` | major | yes |
| 5 | `docs/agent-prompts/*-reviewer.md` changed without `server/src/db/seed-prompts.ts`, or the reverse | `prompt-copies` | major | yes |
| 7 | A command below fails | `build-broken` | critical | no |

The secret report never prints the matched value — only file, line and which key matched.

## Commands (7)

Run only for packages with a changed code file (`.ts .tsx .js .mjs .cjs .json`, migrations
excluded). A reviewer-core change also runs the server typecheck (the server compiles
reviewer-core's source).

| Package | Commands | Needs `node_modules` in |
|---|---|---|
| server | `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · `pnpm arch:check` | server, reviewer-core |
| client | `pnpm typecheck` · `pnpm test` | client |
| reviewer-core | `npm run typecheck` · `npm test` | reviewer-core |
| e2e | `npm run typecheck` | e2e |

Integration tests (`*.it.test.ts`, Testcontainers) and the browser e2e are not run — they
need Docker and belong to CI. Missing `node_modules` or a missing tool → the command is
`skipped` and the verdict is **INCOMPLETE** (never PASS). `--no-commands` does the same.

## Warnings (never block)

| Rule id | When |
|---|---|
| `branch-main` | The branch is `main`/`master` or HEAD is detached |
| `dirty-tree` | Uncommitted or untracked changes exist — the verdict cannot unlock a push |
| `staged-only` | Run with `--staged-only` — informational only |
| `feature-mix` | A later commit has a different conventional-commit scope than the first AND touches none of the first commit's top-level dirs; or commits reference more than one course spec (`L01`, `L02`, …). Several commits for one feature are fine. |
| `unmapped-skill` | A `.claude/skills/*` folder is in no routing row and not in "Never routed" |
| `guard-file-touched` | `reviewer-core/src/grounding.ts` or `prompt.ts` changed — reviewers look at it closely |
