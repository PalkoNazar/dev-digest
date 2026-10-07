# DevDigest

Local-first AI pull-request review. This is a **course starter**: it does one thing
end to end (import a PR → run an agent review). Lessons L01–L08 each add one feature
back — don't build future-lesson features unless the task asks for them.

## Stack
Node ≥22 · pnpm ≥10 · TypeScript 5.7 (strict, `noUncheckedIndexedAccess`) · Zod 3 · vitest 2
- server: Fastify 5 · Drizzle 0.38 · Postgres 16 + pgvector (Docker) · p-queue · SSE
- client: Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl
- LLM: OpenAI · Anthropic · OpenRouter (via adapters, keys optional to boot)

## Commands
- Whole stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Hermetic browser e2e: `./scripts/e2e.sh` (own Postgres :5433, never touches dev DB)
- Per package, run inside it: `pnpm typecheck` · `pnpm test`
  (reviewer-core and e2e use **npm** — they have `package-lock.json`)
- MCP server for Claude Code: `.mcp.json` runs `pnpm --silent --dir mcp start` (API must be up)

## Map
- `server/` — Fastify API :3001, DB, jobs, repo-intel → `server/AGENTS.md`
- `client/` — Next.js studio :3000 → `client/AGENTS.md`
- `reviewer-core/` — pure review engine (diff → prompt → LLM → grounded findings)
- `mcp/` — devdigest-mcp: stdio MCP server, thin tools over the REST API → `mcp/AGENTS.md`
- `e2e/` — deterministic agent-browser flows on seeded data (no LLM)
- `docs/` — cross-package docs (reviewer prompts live in `docs/agent-prompts/`)
- `specs/` — cross-package feature specs · `INSIGHTS.md` — learned gotchas
- `.claude/skills/` — project skills (Fastify, Drizzle, Next, React, Zod, …)

## Rules
- NOT a monorepo: no workspace, one lockfile per package. Cross-package code is
  imported as **source** via tsconfig path aliases, never as a published package.
- A Zod contract in `@devdigest/shared` is both the TS type and the route schema:
  change the contract first, then server and client.
- Every outside dependency (LLM, GitHub, git, secrets) goes through an adapter in the
  DI container (`server/src/platform/container.ts`) so tests can inject mocks.
- Every DB query is scoped by `workspaceId` (from `getContext`).

## Gotchas
- `@devdigest/shared` exists TWICE — `server/src/vendor/shared` and
  `client/src/vendor/shared` — and the copies already differ. Edit both, or say why not.
- reviewer-core resolves `@devdigest/shared` from `../server/...` and `zod` from its own
  `node_modules` → its deps must be installed for the server to typecheck.
- Migrations are NOT applied on boot: `cd server && pnpm db:migrate`.
- Reviewer prompts have three copies: `docs/agent-prompts/*.md`,
  `server/src/db/seed-prompts.ts`, and the DB row (source of truth at run time).
- Code comments use task tags (`F1`, `A2`, `T1.3`, `T3`) and mention an `agent-runner`
  — that CI package arrives in L06 and does not exist yet.
- Every `CLAUDE.md` is a symlink to the `AGENTS.md` beside it — edit `AGENTS.md`. New
  directory docs: write `AGENTS.md`, then `ln -s AGENTS.md CLAUDE.md`. Windows clones need
  `git config core.symlinks true`, else the link is checked out as a plain text file.

## Do not touch
- `server/src/db/migrations/**` — generate with `pnpm db:generate`, never hand-edit.
- The grounding gate (`groundFindings`) and `INJECTION_GUARD` — never bypass or weaken.
- Secrets: only `~/.devdigest/secrets.json` / env. Never in git, DB, logs or traces.
- Never `docker compose down -v` — it deletes the dev DB volume with all imported data.

## Before you start
- Architecture and diagrams: `README.md` · testing strategy: `TESTING.md`
- Task is a course feature → read its spec in `specs/` or `<package>/specs/` first
- Before working in a package, read its `INSIGHTS.md` — treat it as high-confidence
  guidance unless the user says otherwise
- Confirmed something non-obvious, or finished a non-trivial task → run
  `/engineering-insights` (append-only; do not skip this step)
