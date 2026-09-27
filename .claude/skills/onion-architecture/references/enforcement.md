# Enforcement: dependency-cruiser fitness function

Rules are only real if a machine checks them. `server/.dependency-cruiser.cjs` encodes the
ring table from `SKILL.md`; dependency-cruiser was already a server dependency (the
repo-intel `depgraph` adapter uses it), so no new package was added.

## Commands (run in `server/`)

| Command | What it does |
|---|---|
| `pnpm arch:check` | cruise `src/` (+ reviewer-core through the path alias); fail on any violation **not** in the baseline |
| `pnpm arch:baseline` | rewrite `.dependency-cruiser-known-violations.json` from the current state |
| `pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err` | show all violations, known ones included |

## Rules

| Rule | Forbids |
|---|---|
| `no-circular` | any import cycle |
| `shared-is-innermost` | `vendor/shared` importing anything but `zod` and itself |
| `reviewer-core-is-pure` | reviewer-core importing server code, Drizzle, Fastify, `fs`, `child_process`, or any SDK from `SDKS` except `openai` (its LLM helpers — `REVIEWER_CORE_ALLOWED_SDKS`) |
| `drizzle-only-in-repositories` | `drizzle-orm`, `postgres`, `src/db/**` from any module file except `repository.ts` / `repository/**` |
| `sdk-only-in-adapters` | vendor SDKs (octokit, openai, anthropic, simple-git, ast-grep, ripgrep, dependency-cruiser, js-tiktoken) from `modules/**` |
| `modules-use-ports-not-adapters` | `modules/**` importing `src/adapters/**` |
| `fastify-only-in-routes` | Fastify packages (`fastify`, `@fastify/*`, `fastify-type-provider-zod`, `fastify-sse-v2`) from module files other than `routes.ts`, `modules/index.ts`, `_shared/context.ts` |
| `no-container-in-core` | module core (everything but routes/repository) importing `platform/container.ts` |
| `no-infra-in-core` | module core importing `platform/{jobs,sse,run-logger,trace-builder}.ts` |
| `no-cross-module-internals` | `modules/a/**` importing `modules/b/**` (except `_shared`) |
| `outer-ring-not-into-modules` | `adapters/`, `db/`, `platform/` (except `container.ts`) importing `modules/**` |
| `module-registry-only-from-app` | anything but `app.ts` importing `modules/index.ts` |

Notes:
- `tsPreCompilationDeps: true` → `import type` counts. A type-only import still couples
  the rings, and it is exactly how service-locator leaks (`type Container`) hide.
- Pure computation libraries (graphology, p-queue) are intentionally allowed in the core.
- Every package rule is built by `pkgPattern([...])` → `(^|node_modules/)(a|b)(/|$)`, which
  matches both the resolved pnpm path and an unresolved bare name. Add packages to the
  lists (`SDKS`, `DB_PKGS`, `FASTIFY_PKGS`); don't hand-write `node_modules/x/` patterns.
- The reviewer-core ban list is built from those same lists, so a new SDK added to
  `SDKS` is banned in reviewer-core too (its packages aren't installed there, so imports
  stay unresolved — hence the bare-name form).
- Regexes must pass dependency-cruiser's safe-regex check: `(.+/)?` is rejected; use `.*`.
- Don't add an `exclude` like `(^|/)dist/` — pnpm resolves packages to
  `node_modules/.pnpm/<pkg>/…/dist/index.js`, so it silently hides SDK imports.

## Baseline workflow ("only shrinks")

- The known-violations file freezes legacy debt so the check can be green today while
  **new** code must comply.
- Fixed a violation → run `pnpm arch:baseline` and commit the smaller file.
- Never run `arch:baseline` to make a *new* violation pass. If a rule is wrong, change the
  rule in `.dependency-cruiser.cjs` with a comment explaining why, in its own commit.
- Review tip: a PR diff that *adds* lines to the known-violations file is a red flag.

## Sources
- [dependency-cruiser: rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) ·
  [options reference (known violations, tsPreCompilationDeps)](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md)
- [Ken Miyashita: Validate dependencies according to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
- [Xebia: Taking frontend architecture serious with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)
- [Atomic Object: Restrict imports with dependency-cruiser](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [DEV: Avoid cross-module dependencies with dependency-cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [Remo Jansen: Enforce Clean Architecture with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)
