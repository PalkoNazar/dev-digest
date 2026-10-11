# devdigest-mcp

stdio MCP server that lets a coding agent (Claude Code, Cursor, …) use DevDigest without the UI.
It is a thin client over the DevDigest REST API.

## Tools
| Tool | What it does |
|---|---|
| `list_agents` | Configured reviewer agents (source of valid agent names/ids) |
| `run_agent_on_pr` | Runs one agent on an imported PR, waits, returns verdict + findings. Only write tool |
| `get_findings` | Findings of an already finished review (latest per agent, or one `run_id`) |
| `get_conventions` | A repo's conventions (default: accepted) |
| `get_blast_radius` | Stub: always `isError` ("not implemented yet") |

PRs are addressed as `repo: "owner/name"` + `pr` (number); `agent` is a name or an id.

## Use in Claude Code
1. Start the API: `./scripts/dev.sh` (it also installs `mcp/` deps; it does not start this server).
2. Open Claude Code in this repo and approve `devdigest` from `.mcp.json`; `/mcp` should show it connected.

`.mcp.json` runs `pnpm --silent --dir mcp start`. Set `DEVDIGEST_API_URL` to point at another API
origin (default `http://localhost:3001`).

## `run_agent_on_pr` duration
Starts the run, polls its status every 3 s, gives up after 15 min (the run keeps going; use
`get_findings` later), then reads the finished review. If the client sent a `progressToken`,
a progress notification is sent every 10 s.

## Develop
```sh
cd mcp && pnpm install
pnpm typecheck && pnpm test
```
Layout and the dependency rules → `AGENTS.md`.
