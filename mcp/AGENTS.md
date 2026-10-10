# mcp — devdigest-mcp (stdio MCP server)

Exposes DevDigest to coding agents (Claude Code) as five MCP tools over the local REST
API (`http://localhost:3001`). No DB, no LLM keys: the API owns keys and workspace
scoping. Tool design rules and budgets → `specs/L04-mcp-server.md`.

## Commands
- `pnpm typecheck` · `pnpm test` (vitest; hermetic, API is a fake)
- `pnpm start` — `tsx src/index.ts`; Claude Code runs it via the repo-root `.mcp.json`.
- Config: only `DEVDIGEST_API_URL` (default `http://localhost:3001`, http(s), no query/fragment).

## Rings (source dependencies point inward)
| Ring | Path | May import | Must NOT import |
|---|---|---|---|
| core | `src/core/**` | `@devdigest/shared`, `zod`, own files | `@modelcontextprotocol/sdk`, `../api`, `../mcp`, `process.env` |
| api (adapter) | `src/api/**` | core port/errors, `@devdigest/shared`, `zod` | `../mcp`, the MCP SDK |
| mcp (edge) | `src/mcp/**` | core, the MCP SDK, `zod` | `../api`, `process.env` |
| root | `src/index.ts`, `src/config.ts` | everything — composition root | — |

Only `index.ts` imports `api/http` and `config`. `test/architecture.test.ts` enforces this
table and bans stdout writes (`console.log`, `console.info`, `process.stdout.write`) in `src/`.

## Layout
- `src/core/` — `DevDigestApi` port (`port.ts`), use cases per tool, repo/PR/agent
  resolution, `wait-for-run.ts`, compact renderers (`format.ts`), `ToolError`, constants/budgets.
- `src/api/http.ts` — fetch adapter; parses responses with the shared Zod contracts.
- `src/mcp/` — `server.ts` (`buildServer`), `tools/*.ts` (one file per tool), `results.ts`.
- `test/` — vitest; fake API in `test/helpers/`; `stdio.test.ts` spawns the real entry.

## Rules
- `@devdigest/shared` is imported as source from the **server** copy via the tsconfig path alias.
- stdout is the protocol channel: logs go to stderr only.
- Five tools, flat primitive input schemas, no `outputSchema`, no resources/prompts. Budgets
  (instructions ≤ 400 chars, descriptions ≤ 300, `tools/list` ≤ 6,000) are tested in
  `surface.test.ts`; on a failure shorten the text, never raise the limit.
- Failures are `isError: true` results with a one-line cause and the next step, not protocol errors.
- `run_agent_on_pr` is the only write tool; it resolves every argument before the POST so a bad
  argument never starts a paid run.
- `get_blast_radius` is read-only: it resolves the repo with `listRepos`, then calls
  `GET /repos/:id/pulls/:number/blast` (`core/get-blast-radius.ts`). Never resolve the PR via
  `listPulls` — `GET /repos/:id/pulls` upserts, which would make the tool a write. The result is
  cut at `BLAST_RESULT_BUDGET_CHARS` (`format.ts`); an unknown PR (404) is an `isError` with an
  import hint. Spec → `specs/L04-blast-radius.md`.
