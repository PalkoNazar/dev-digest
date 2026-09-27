---
name: onion-architecture
description: "Onion (ports & adapters) architecture for the DevDigest backend — server/src and reviewer-core: which layer a piece of backend code belongs to, which imports are allowed, how a module splits into routes → service → ports → repository, how services get dependencies (constructor injection of narrow ports, never the whole Container), where Drizzle, Fastify, Zod parsing, SDKs, jobs and SSE may appear, and how to keep `pnpm arch:check` (dependency-cruiser) green. Use whenever you add or move a file under server/src or reviewer-core/src, create a module/route/service/repository/adapter/job, touch platform/container.ts, put a DB query or SDK call somewhere, or review a backend PR for structure — even if the user only says 'add an endpoint', 'add a column to this response', 'call GitHub from here' or 'where should this go'."
metadata:
  version: 1.0.0
  updated: 2026-09-27
  scope: server/src, reviewer-core/src
---

# Onion architecture — DevDigest backend

Backend code is arranged in rings. **Source dependencies point only inward**: inner code
never names anything from an outer ring — not a class, not a type, not a data format
(Palermo's Onion, Martin's Dependency Rule, Cockburn's Ports & Adapters). Infrastructure
(Fastify, Drizzle, SDKs, p-queue jobs, SSE) is pushed to the edge and plugged in through
interfaces, so the core can be tested with plain fakes and swapped without edits.

This skill covers *where backend code lives and what it may import*. For how to write the
inside of a route see `fastify-best-practices`; queries and schema → `drizzle-orm-patterns`,
`postgresql-table-design`; schemas → `zod`. Where those skills hang services on Fastify
decorators over `fastify.db` or query without a repository boundary, **this skill wins**
for DevDigest.

## The rings

```
 ┌─ OUTER: infrastructure & delivery ────────────────────────────────────────────┐
 │  modules/<m>/routes.ts   Fastify plugin = the module's edge + its wiring       │
 │  modules/<m>/repository.ts, repository/*.repo.ts   Drizzle (implements ports)  │
 │  adapters/**   SDKs (octokit, openai, simple-git, ast-grep…) implement ports   │
 │  db/**  platform/**  app.ts   container.ts = COMPOSITION ROOT                  │
 │ ┌─ APPLICATION: use cases ──────────────────────────────────────────────────┐ │
 │ │  modules/<m>/service.ts (+ run-executor, pipeline/…)                      │ │
 │ │  orchestrates ports, owns the transaction boundary, throws AppError       │ │
 │ │ ┌─ DOMAIN SERVICES & PORTS ─────────────────────────────────────────────┐ │ │
 │ │ │  modules/<m>/ports.ts   interfaces the service needs (repo, queue…)   │ │ │
 │ │ │  modules/<m>/helpers.ts constants.ts types.ts   pure, no I/O          │ │ │
 │ │ │ ┌─ DOMAIN MODEL ────────────────────────────────────────────────────┐ │ │ │
 │ │ │ │  @devdigest/shared (vendor/shared): Zod contracts + adapter ports │ │ │ │
 │ │ │ │  @devdigest/reviewer-core: pure review engine (grounding, prompt) │ │ │ │
 │ │ │ └───────────────────────────────────────────────────────────────────┘ │ │ │
 │ │ └───────────────────────────────────────────────────────────────────────┘ │ │
 │ └───────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────────────────────────────────────────────┘
```

| Ring | May import | Must NOT import |
|---|---|---|
| `vendor/shared` | `zod`, itself | anything else in `src/`, any framework or SDK |
| `reviewer-core` | `@devdigest/shared`, `zod`, `openai` (its LLM helpers only) | `db/`, `modules/`, `platform/`, `adapters/`, Fastify, Drizzle, `fs`, any other SDK |
| module core (`service`, `helpers`, `ports`, `types`, `constants`, `pipeline/`…) | shared, reviewer-core, own module files, `platform/errors`, `platform/resilience`, pure libs (graphology, p-queue) | `platform/container`, `platform/{jobs,sse,run-logger}`, `db/**`, `drizzle-orm`, `fastify`, `adapters/**`, SDKs, other modules |
| `repository*` | `drizzle-orm`, `db/schema`, `db/client`, `db/rows`, shared, own `ports`/`types` | `fastify`, container, other modules |
| `routes.ts` | Fastify, `app.container`, own service/repository, `_shared/*`, shared | `drizzle-orm`, `db/**`, SDKs, other modules |
| `adapters/**` | its SDK, shared ports, `platform/errors` | `modules/**`, `platform/container` |
| `platform/container.ts`, `app.ts` | everything — this is where rings are wired | — |

`pnpm arch:check` (in `server/`) enforces these rows with dependency-cruiser. Known
legacy violations are frozen in `.dependency-cruiser-known-violations.json`; a new one
fails the check. Details → `references/enforcement.md`.

## Where does X go? (decision table)

| You have… | Put it in |
|---|---|
| A new HTTP endpoint | `modules/<m>/routes.ts`: schema → `getContext` → one service call → return. Nothing else. |
| Business rule / orchestration (if/else on domain state, calling 2+ ports) | `modules/<m>/service.ts` method (a use case) |
| A calculation / mapping with no I/O | `modules/<m>/helpers.ts` (unit-tested without mocks) |
| A SQL query | a method on `modules/<m>/repository.ts` (or `repository/<entity>.repo.ts`), declared in `ports.ts` |
| Row → contract mapping (`toAgentDto`) | inside the repository (or `repository/mappers.ts`); rows never leave it |
| A shape crossing HTTP or the client | Zod contract in `@devdigest/shared` — server copy AND client copy |
| A type used only by the module's core | `modules/<m>/types.ts` |
| An interface the service depends on | `modules/<m>/ports.ts` (module-local) or `vendor/shared/adapters.ts` (external system) |
| A call to GitHub / git / LLM / filesystem tool / new SDK | an adapter in `adapters/<x>/` implementing a port + mock in `adapters/mocks.ts` + getter in `container.ts` |
| Data owned by another module | a port exposed on the container (`container.agentsRepo`, `container.repoIntel`), injected — never `import '../other-module/…'` |
| Long-running work (clone, index, run) | service calls a `JobQueue` port; `routes.ts` registers the handler on `app.container.jobs` |
| Live progress events | service emits through a small `RunEvents` port; `runBus` is injected at the edge |
| A new domain error | subclass in `platform/errors.ts`; the global handler maps it to HTTP |
| Env / config value | `platform/config.ts`; secrets only via `container.secrets` |

## Module shape

```
modules/<name>/
├── routes.ts        edge: Fastify plugin; builds the service with its deps; registers job handlers
├── service.ts       use cases: class XService { constructor(private deps: XDeps) }
├── ports.ts         export interface XRepo {…}; export interface XDeps { repo: XRepo; … }
├── repository.ts    class XRepository implements XRepo — Drizzle only here
├── helpers.ts       pure functions (optional)
├── constants.ts     (optional)
└── types.ts         module-internal domain types (optional)
```

Create only files that have content. Big modules may split `repository/` and `pipeline/`
folders; the same ring rules apply to every file inside.

### The wiring, end to end

```ts
// ports.ts — what the use case needs, in domain terms. No Drizzle, no Fastify.
import type { Agent, LLMProvider, Provider } from '@devdigest/shared';
export interface AgentsRepo {
  list(workspaceId: string): Promise<Agent[]>;
  findById(workspaceId: string, id: string): Promise<Agent | null>;
}
export interface AgentsDeps { repo: AgentsRepo; llm: (p: Provider) => Promise<LLMProvider> }

// service.ts — depends on ports only; trivially testable with fakes.
export class AgentsService {
  constructor(private readonly deps: AgentsDeps) {}
  async get(workspaceId: string, id: string): Promise<Agent> {
    const agent = await this.deps.repo.findById(workspaceId, id);
    if (!agent) throw new NotFoundError(`Agent ${id} not found`);
    return agent;
  }
}

// repository.ts — implements the port; rows are mapped before they leave.
export class AgentsRepository implements AgentsRepo {
  constructor(private readonly db: Db) {}
  async findById(workspaceId: string, id: string) {
    const [row] = await this.db.select().from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row ? toAgentDto(row) : null;
  }
}

// routes.ts — the edge: the ONLY module file that reads app.container.
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService({
    repo: app.container.agentsRepo,
    llm: (p) => app.container.llm(p),
  });
  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });
}
```

## Hard rules

1. **Dependency rule.** An inner file never imports from an outer ring, including
   `import type`. A type-only import of `Container`, a Drizzle row or `FastifyRequest`
   still couples the core to that ring (the check counts them).
2. **No service locator in the core.** A service receives narrow, named dependencies
   (`{ repo, llm, jobs }`) via its constructor — never `Container`. Composition happens in
   `platform/container.ts` (shared ports) and the module's `routes.ts` (module wiring).
   Never `new XRepository(...)` or `new SomeAdapter(...)` inside a service.
3. **Thin routes.** A handler parses (Zod schema on the route), resolves `getContext`,
   calls ONE service method, shapes the reply (status code). No queries, no SDK calls,
   no business `if`s. Don't `Schema.parse(req.body)` by hand; don't `try/catch` to build
   HTTP errors — throw `AppError`s from the service.
4. **Drizzle stays in repositories.** Repositories return `@devdigest/shared` contracts or
   module `types.ts` shapes, not `$inferSelect` rows. Every query filters by `workspaceId`
   (child tables via their parent). The service owns transaction boundaries → see
   `references/drizzle.md`.
5. **Parse at every boundary, trust inside.** HTTP input (route schema), job payloads
   (`unknown` → Zod parse in the handler), LLM output (`platform/structured.ts`), external
   API data (in the adapter). Never re-validate inside the core.
6. **Every outside system is a port + adapter + mock.** SDK imports live only in
   `adapters/**`; the port lives in `vendor/shared/adapters.ts`; the mock in
   `adapters/mocks.ts`; the lazy getter + override in `container.ts`.
7. **Modules don't import each other.** Share through a port on the container or move the
   shared piece inward (`@devdigest/shared`, `_shared/`). Adapters never import modules —
   constants they need move into the adapter or into shared.
8. **reviewer-core stays pure.** No DB, fs, GitHub, env. Its only side effect is the
   injected `LLMProvider`. `groundFindings` and `INJECTION_GUARD` are never bypassed.

## Checklist (new code or PR review)

- [ ] `pnpm arch:check` passes in `server/` (no new violations; baseline not grown).
- [ ] New route: schema from `@devdigest/shared` / `_shared/schemas`, `getContext` first,
      one service call.
- [ ] New service: constructor takes a `…Deps` interface from `ports.ts`; no `Container`.
- [ ] New query: in a repository, scoped by `workspaceId`, returns contracts not rows.
- [ ] New external call: port + adapter + mock + container getter; unit test uses the mock.
- [ ] Contract changed: server AND client copies of `@devdigest/shared` updated.
- [ ] Service unit test uses hand-written fakes of its ports (no DB, no container);
      repository covered by a `*.it.test.ts`.
- [ ] Touched a legacy file listed in `references/migration.md`? Don't add to the debt;
      if you fix a violation, run `pnpm arch:baseline` so the baseline shrinks.

## Pragmatic limits (don't over-engineer)

- Domain model = Zod contracts + plain functions. No entity classes, aggregates, value
  objects or a DI framework — a course starter doesn't need them.
- One interface per real seam. Don't add a port for a pure helper or for a library that
  does no I/O (graphology, p-queue are fine in the core).
- A trivial read endpoint may be `route → repository` through a one-line service method;
  keep the service anyway so the rule stays uniform.

## References

- `references/fastify.md` — the delivery ring: plugin, schemas, errors, decorators
- `references/drizzle.md` — repositories, mapping, transactions, workspace scoping
- `references/zod-contracts.md` — contracts as the domain model; parse-at-boundary map
- `references/adapters-di.md` — ports, adapters, composition root, jobs, SSE
- `references/testing.md` — which test for which ring
- `references/migration.md` — legacy violations and how to fix each
- `references/enforcement.md` — dependency-cruiser rules, baseline workflow
- `README.md` — research sources and design decisions
