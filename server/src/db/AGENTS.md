# server/db

Drizzle schema + migrations + seed for Postgres 16 with pgvector.

## Workflow
1. Edit `schema/<domain>.ts` (re-exported by `schema.ts`).
2. `pnpm db:generate` → new SQL in `migrations/` (review it).
3. `pnpm db:migrate` — never applied automatically on boot.

## Rules
- Shared row types go in `rows.ts` (`$inferSelect`), not inside a module's repository,
  so modules never import another module's data layer.
- Top-level tables carry `workspace_id` — always filter by it. Child tables
  (`findings`, repo-intel tables) are scoped through their parent (review / repo).
- `seed.ts` must stay idempotent (e2e and dev.sh re-run it).

## Gotchas
- The schema already holds EVERY course table (~58); most stay empty in the starter.
  Don't delete "unused" tables — later lessons fill them.
- pgvector is enabled by migration `0000_init.sql`.
- `seed-prompts.ts` mirrors `/docs/agent-prompts/*.md` — keep both in sync.

## Do not touch
- `migrations/**` and `migrations/meta/**` — generated; never hand-edit or renumber.
