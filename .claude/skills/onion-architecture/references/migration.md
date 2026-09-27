# Migrating legacy code (the known-violations baseline)

State on 2026-09-27: **41 known violations** in `server/.dependency-cruiser-known-violations.json`.
They are frozen, not endorsed. Don't copy these shapes into new code. When a task touches
one of these files anyway, fix the violation in a separate commit if it is small, then
`pnpm arch:baseline`. Recount with:

```bash
cd server && node -e "const v=require('./.dependency-cruiser-known-violations.json');const c={};for(const x of v)c[x.rule.name]=(c[x.rule.name]||0)+1;console.log(v.length,c)"
```

## By module, with the target fix

| Module / file | Violation | Fix |
|---|---|---|
| `pulls/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts` | Drizzle + `db/schema` in handlers (routes-only legacy shape) | extract `repository.ts` (+ `ports.ts`) and a `service.ts`; routes keep only schema → context → service call |
| `settings/feature-models.ts` | reads `Container` and Drizzle | split: queries → `settings/repository.ts`; logic takes `{ repo }` |
| `agents/service.ts`, `repos/service.ts`, `reviews/service.ts`, `repo-intel/service.ts` | constructor takes `Container` (service locator) | define `…Deps` in `ports.ts`; build in `routes.ts` / container getter |
| `reviews/run-executor.ts`, `reviews/diff-loader.ts` | `Container`, `db/schema`, `db/rows`, concrete `RunLogger` | inject `{ reviews, agents, llm, git, events }`; take domain types from the repository |
| `reviews/service.ts` | `AgentRow` from `db/rows` | `container.agentsRepo` returns the `Agent` contract |
| `repos/helpers.ts` | imports `db/schema` for a row type | move the row → DTO mapper into `repos/repository.ts` |
| `agents/helpers.ts` ↔ `agents/repository.ts` | cycle (helpers take row types, repository uses `isConfigChange`) | move `toAgentDto`/`toAgentVersionDto` into the repository; helpers keep pure config logic |
| `repo-intel/service.ts`, `pipeline/full.ts`, `pipeline/incremental.ts` | `Container` (and cycle via `container.repoIntel`) | pass `{ repo, git, depgraph, tokenizer, parser }` explicitly; container getter builds them |
| `repo-intel/**` → `adapters/astgrep`, `adapters/codeindex/extract`, `adapters/tokenizer` | adapters imported directly | add a `SymbolParser` / `EndpointExtractor` port; `Tokenizer`/`DepGraph` ports already exist — inject them |
| `reviews/diff-loader.ts` → `adapters/git/diff-parser.ts` | adapter imported directly | the parser is pure: move it inward (reviewer-core or shared) or return a parsed diff from `GitClient` |
| `adapters/astgrep`, `adapters/depgraph` → `repo-intel/constants.ts` | outer ring imports a module | move `SUPPORTED_EXT` / `MAX_SIGNATURE_CHARS` into the adapter (or shared) and have repo-intel import from there via the port |
| `repos/service.ts` → `repo-intel/constants.ts` | cross-module internals | expose what repos needs through the `RepoIntel` port (e.g. `container.repoIntel.resyncJobKind`) or move the constant to shared |

## Order that pays off first

1. Routes-only modules (`pulls`, `polling`, `workspace`, `settings`) — biggest, simplest
   wins; unlocks unit tests for them.
2. `agents` (small, clean template for the rest).
3. `reviews` (run executor is the hottest path; ports make it mock-testable end to end).
4. `repo-intel` (largest; do the constants move first to break the adapter → module edge).

Each step: one module per branch/commit, `pnpm typecheck && pnpm test && pnpm arch:check`,
then `pnpm arch:baseline`.
