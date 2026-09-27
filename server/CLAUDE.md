# server — `@devdigest/api`

Fastify API on :3001. Imports repos/PRs, indexes repos (repo-intel), stores agents,
runs reviews through `@devdigest/reviewer-core`.

## Commands
- `pnpm dev` (tsx watch) · `pnpm typecheck` · `pnpm build`
- `pnpm db:migrate` · `pnpm db:seed` (idempotent) · `pnpm db:generate` (after schema edits)
- Unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration (Docker, testcontainers): `pnpm exec vitest run .it.test`

## Layout
- `src/app.ts` — builds the app: plugins first, then `src/modules/index.ts`
- `src/modules/<name>/` — feature plugins → `src/modules/CLAUDE.md`
- `src/platform/` — DI container, JobRunner, SSE runBus, errors, config
- `src/adapters/` — port implementations + `mocks.ts`
- `src/db/` — Drizzle schema, migrations, seed
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (server copy)
- `src/prompts/*.md` — system-feature prompt templates (`{{var}}`), loaded by `src/platform/prompts.ts`
- `test/` — all tests (flat, not colocated); `test/helpers/` — pg testcontainer, app builders

## Conventions
- Imports use `.js` suffix on relative paths (ESM, `moduleResolution: Bundler`).
- Throw `AppError` / `NotFoundError` / `ConfigError` (`src/platform/errors.ts`); the global
  handler turns them into `{ error: { code, message, details } }`. Validation → 422.
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts`.
- Unit tests build the container with `ContainerOverrides` + mocks, not real adapters.
- Config (`src/platform/config.ts`) holds no secrets; keys go through `container.secrets`.

## Gotchas
- `NODE_ENV=test` silences logs and disables the global rate limit.
- `container.github()` / `container.llm()` throw `ConfigError` when the key is missing —
  read paths catch it and degrade (local-first); write paths surface it.
- A production `build` does not copy `src/prompts` → `dist/prompts`; only `tsx` dev works.

## Docs
- API map, env vars, request/DI flow: `README.md`
- Deep dives: `docs/` · feature specs: `specs/` · learned gotchas: `INSIGHTS.md`
