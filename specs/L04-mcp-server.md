# devdigest-mcp — DevDigest as MCP tools for coding agents
Status: implemented · Lesson: L04 · Packages: mcp (new), server (read-only use of its API)

## Goal
A coding agent (Claude Code, Cursor, …) can use DevDigest without the UI: see which
reviewers are configured, run a review on an imported PR, read its findings, read the
repo's accepted conventions — and later ask for a PR's blast radius. Connecting the
server costs almost nothing at chat start: in Claude Code only the server name, its
short instructions and five tool names enter the context until a tool is actually needed.

## Scope
- In:
  - New package `mcp/` (`devdigest-mcp`), stdio transport, five tools:
    `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (stub).
  - Thin client over the existing REST API (`http://localhost:3001`) — no DB, no LLM keys.
  - Project `.mcp.json` at the repo root so Claude Code in this repo picks it up.
  - Token budgets for the tool definitions and for every tool result, guarded by tests.
- Out:
  - Blast radius itself (separate L04 feature; this spec only fixes the tool's input shape).
  - Remote / Streamable HTTP transport, OAuth, multi-workspace (single-user, local-first).
  - MCP resources and prompts (each adds discovery surface; no use case yet).
  - New server routes — every tool maps onto routes that already exist.

## Tool design principles (course slide — every tool follows all four)
1. **Outcome, not operation.** `run_agent_on_pr(repo, pr, agent)` does all three steps itself —
   creates the run, waits for it, returns the findings. The agent never chains
   resolve-PR → start-run → poll → fetch.
2. **Flat arguments.** `repo`, `pr`, `agent` are separate primitive values. No nested
   objects — models (especially non-Anthropic ones) get nested arguments wrong more often.
3. **Concise structured response.** Return `{verdict, findings[]}` with only the fields the
   agent needs, never a raw API dump — one full response easily costs tens of thousands
   of tokens.
4. **The error leads on.** Not a bare "404" but "agent not found — call list_agents", so
   the agent takes the next step instead of getting stuck.

Tool roles (course slide): `list_agents` — which reviewer agents are configured; the source
of a valid agent id. `run_agent_on_pr` — runs the review, waits, returns finished findings;
**the only write tool**. `get_findings` — concise verdict of an already finished run.
`get_conventions` — the repo's conventions, the same repo conventions as L02.
`get_blast_radius` — the PR's impact map; implemented later (homework), stub now.

## Research summary (why the design looks like this)
| Practice | Source | Applied as |
|---|---|---|
| Claude Code defers MCP tools by default (tool search): at session start only tool **names** and server **instructions** load; full schemas load on demand | code.claude.com/docs/en/mcp § "Scale with MCP tool search" | Short, keyword-rich `instructions`; no `alwaysLoad` |
| Tool descriptions and server instructions are truncated at 2,048 chars — put the key facts first | same | Descriptions ≤ ~300 chars, purpose in the first sentence |
| Clients without tool search (Cursor, older clients, `ENABLE_TOOL_SEARCH=false`, custom `ANTHROPIC_BASE_URL`) load every full definition on every turn | same; Cyclr / The New Stack token-bloat reports | Five tools, flat input schemas, no `outputSchema`; whole `tools/list` ≤ 6,000 chars (test) |
| Few, task-shaped tools beat one-tool-per-endpoint | Anthropic, "Writing effective tools for agents" | `run_agent_on_pr` = resolve + run + wait + findings; `get_findings` hides the PR → reviews → run lookup |
| `response_format` concise/detailed — concise ≈ ⅓ the tokens | same | `detail: "concise" \| "full"`, default concise |
| Sensible pagination / filtering defaults; Claude Code warns at 10k tokens, cuts at 25k | same; Claude Code MCP docs | `limit` (default 20) + "N more, raise limit" hint; results target < 2k tokens |
| Semantic identifiers over UUIDs reduce hallucinated IDs | Anthropic, same article | Address PRs as `repo: "owner/name"` + `pr` (number); `agent` by name or id |
| Actionable errors as `isError: true` results, not protocol errors | MCP spec 2025-06-18 § Tools / Error Handling | Every API failure → one-line cause + next step |
| Annotations `readOnlyHint` / `destructiveHint` / `openWorldHint` | MCP spec § Tools | Reads `readOnlyHint: true`; `run_agent_on_pr` `readOnlyHint: false, destructiveHint: false, openWorldHint: true` (spends LLM money) |
| stdio: stdout is the protocol channel | MCP spec § Transports | Logs only to stderr |

SDK: `@modelcontextprotocol/sdk` 1.x (`latest` = 1.32.1; v2 is beta) — `McpServer.registerTool`,
`StdioServerTransport`, `InMemoryTransport` for tests.

## Design

### Package `mcp/`
```
mcp/
  package.json            # pnpm, "type": "module", `start` = tsx src/index.ts (no bin, no build)
  tsconfig.json           # path alias @devdigest/shared → ../server/src/vendor/shared
  src/index.ts            # composition root: config → HTTP adapter → buildServer → stdio
  src/config.ts           # DEVDIGEST_API_URL
  src/core/               # port `DevDigestApi`, use cases per tool, resolve, wait-for-run, format
  src/api/http.ts         # HTTP adapter (fetch), parses with shared Zod
  src/mcp/                # server.ts (buildServer), tools/*.ts (one per tool), results.ts
  test/*.test.ts          # vitest, InMemoryTransport + fake DevDigestApi, stdio process test
```
- Not a workspace member; own lockfile (repo rule). Contracts imported as source from the
  **server** copy of `@devdigest/shared` (it is the API's own contract).
- `DevDigestApi` is the only outside dependency and is injected (repo DI rule), so tests
  never need the API running.
- Config: `DEVDIGEST_API_URL` (default `http://localhost:3001`). No secrets — the API owns
  keys and workspace scoping (`getContext`).

### Server identity and instructions (always in context — keep it this small)
`name: "devdigest"`, `instructions` (≤ 400 chars):
> DevDigest: local AI pull-request reviewer. Use these tools to list configured reviewer
> agents, run a review on an imported PR, read its findings, and read a repo's accepted
> coding conventions. PRs are addressed as repo "owner/name" + pr number. The DevDigest
> API must be running (./scripts/dev.sh).

### Tools
Flat PR address on every PR tool: `repo` (string, `owner/name`) + `pr` (int, the PR number).
Resolution: `GET /repos` → match `full_name` → `GET /repos/:id/pulls` → match `number`.
`agent` (string) = agent name (case-insensitive) or id, resolved via `GET /agents`.

| Tool | Input | Calls | Result (compact JSON in one text block) |
|---|---|---|---|
| `list_agents` | — | `GET /agents` | `{agents: [{id, name, model, enabled}]}` — no prompts |
| `run_agent_on_pr` | `repo`, `pr`, `agent` | `POST /pulls/:id/review {agentId}` → poll `GET /pulls/:id/runs` until the run ends → `GET /pulls/:id/reviews` | `{run_id, agent, verdict, score, findings: [...]}` |
| `get_findings` | `repo`, `pr`, `agent?`, `run_id?`, `min_severity?` (default `WARNING`), `detail?` (`concise`), `limit?` (20) | `GET /pulls/:id/reviews` | latest review per agent (or the one for `run_id`): `{reviews: [{run_id, agent, verdict, score, findings: [...]}]}` |
| `get_conventions` | `repo`, `status?` (default `accepted`), `limit?` | `GET /repos/:id/conventions` | `{conventions: [{category, rule, file}]}` |
| `get_blast_radius` | `repo`, `pr` | — | stub, see below |

- Concise finding = `{severity, file, line, title}` (`line` = `"start-end"`); `detail: "full"`
  adds `rationale`, `suggestion`, `confidence`. Dismissed findings are hidden.
- Truncation: lists stop at `limit` and add `"more": N, "hint": "raise limit or filter by min_severity"`.
- One text block of minified JSON, no `structuredContent` / `outputSchema`: the model reads
  the text, and a duplicate JSON block would double the result tokens.
- Findings are LLM output about untrusted PR content — returned as data, never turned
  into instructions; the server does not touch `INJECTION_GUARD` or grounding.

### `run_agent_on_pr` duration
The POST only starts the run; the tool then polls the run status every 3 s, up to 15 min
(on timeout the run keeps going and the error points at `get_findings`), and finally reads
the finished review. When the client sends a `progressToken`, the tool emits a progress
notification every 10 s while waiting (keeps idle timeouts from firing; Claude Code's stdio
idle timeout is 30 min). The API's own rate
limit (10/min) surfaces as an actionable error.

### `get_blast_radius` stub
Final input schema (PR address) so the real implementation does not change the tool
contract. Returns `isError: true` with `Blast radius is not implemented yet in DevDigest.`
— an error, not an empty success, so an agent cannot read it as "no downstream impact".
Description says "not available yet" so agents do not call it speculatively.

### Errors (all `isError: true`, one line, with the next step)
API unreachable → `DevDigest API is not reachable at <url> — start it with ./scripts/dev.sh`.
Agent not found → `Agent "<x>" not found — call list_agents for valid names/ids`.
Repo not found → list known repo names. PR not imported → "import it in the DevDigest UI".
No reviews yet → "call run_agent_on_pr first". LLM key missing (`ConfigError`) → "add a key in Settings".

### Wiring
`.mcp.json` at repo root:
```json
{ "mcpServers": { "devdigest": {
  "command": "pnpm", "args": ["--silent", "--dir", "mcp", "start"],
  "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}" } } } }
```
`start` runs `tsx src/index.ts` (same as the server's dev mode; no build step). No
`alwaysLoad`. Docs: `mcp/AGENTS.md` (+ `CLAUDE.md` symlink), root `AGENTS.md` Map entry.

## Acceptance criteria
- [ ] `tools/list` returns exactly the five tools; serialized definitions ≤ 6,000 chars,
      server `instructions` ≤ 400 chars, every description ≤ 300 chars (test).
- [ ] Every tool has `annotations`; read tools `readOnlyHint: true`, `run_agent_on_pr` not.
- [ ] Every input schema is flat (only string / number / enum properties, no objects or arrays).
- [ ] `run_agent_on_pr` returns the finished findings in the same call (no polling needed).
- [ ] `get_findings` concise output for 20 findings ≤ 4,000 chars (≈ 1k tokens) (test).
- [ ] PRs resolvable by `repo` + `pr`; unknown repo / PR / agent → `isError` naming the next tool or step.
- [ ] `get_blast_radius` → `isError: true`, "not implemented yet".
- [ ] API down → `isError` naming the URL; the MCP process does not crash.
- [ ] Nothing written to stdout except protocol messages.
- [ ] Manual: in Claude Code in this repo, `/mcp` shows `devdigest` connected; a fresh
      chat's `/context` shows no full devdigest tool schemas until a tool is used.
- [ ] `pnpm typecheck` and `pnpm test` pass in `mcp/`.

## Open questions
1. Package vs server module: this spec puts MCP in its own `mcp/` package over HTTP
   (no duplicated logic, API keeps scoping). Alternative: a stdio entry inside `server/`
   that reuses its services directly — one package less, but needs DB + container boot.
2. Should `get_findings` also expose accept/dismiss? Out of scope here (five tools asked).
