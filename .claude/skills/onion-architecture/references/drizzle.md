# Drizzle: the persistence ring

Drizzle is a typed query builder, not an entity mapper. That makes it easy to "just query
from the handler" — exactly what this ring forbids. Queries live behind a repository
port so the core never sees `drizzle-orm`, `db/schema` or a `$inferSelect` row.

## Where Drizzle may appear

| File | `drizzle-orm` / `db/**` |
|---|---|
| `modules/<m>/repository.ts`, `modules/<m>/repository/*.ts` | ✅ |
| `platform/container.ts`, `platform/jobs.ts`, `adapters/auth/local.ts`, `db/**` | ✅ (outer ring) |
| `routes.ts`, `service.ts`, `helpers.ts`, `pipeline/**`, any other module file | ❌ |

## Repository = port implementation

```ts
// ports.ts
export interface ReposRepo {
  list(workspaceId: string): Promise<Repo[]>;
  insert(workspaceId: string, input: NewRepo): Promise<Repo>;
}

// repository.ts
export class RepoRepository implements ReposRepo {
  constructor(private readonly db: DbExecutor) {}
  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRepoDto);          // mapping happens HERE
  }
}
```

- **Return contracts, not rows.** `toXDto(row)` mappers live in the repository file or
  `repository/mappers.ts`. `db/rows.ts` types may be imported only by repositories.
- **Scope every query.** Top-level tables filter by `workspaceId`; child tables
  (`findings`, repo-intel tables) are reached through a parent that was scoped. A method
  that takes an id always takes `workspaceId` too.
- **Granularity.** One repository per module (split into `repository/<entity>.repo.ts`
  when it grows, like `reviews/`). Name methods by intent (`findOpenPulls`,
  `markRunFailed`), not by SQL (`selectWhereStatus`).
- **Cross-module data** (reviews need agents) → the owning module's repository is exposed
  as a port on the container (`container.agentsRepo`) and injected; don't import
  `../agents/repository.js`.

## Transactions: the use case owns the boundary

The service decides what is atomic; the repository doesn't know whether it runs inside a
transaction. Expose a `transaction` on the port that hands back tx-bound repositories:

```ts
// db/client.ts (add when the first transaction is needed)
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbExecutor = Db | DbTx;

// ports.ts
export interface AgentsRepo {
  transaction<T>(work: (repo: AgentsRepo) => Promise<T>): Promise<T>;
  update(workspaceId: string, id: string, patch: AgentPatch): Promise<Agent>;
  addVersion(agentId: string, config: AgentVersionConfig): Promise<void>;
}

// repository.ts
transaction<T>(work: (repo: AgentsRepo) => Promise<T>) {
  return this.db.transaction((tx) => work(new AgentsRepository(tx)));
}

// service.ts — no Drizzle in sight
await this.deps.repo.transaction(async (repo) => {
  const agent = await repo.update(ws, id, patch);
  await repo.addVersion(agent.id, snapshot(agent));
});
```

Keep only DB work inside the callback — never an LLM/GitHub call (it holds a pooled
connection; see the "connection-pool starvation" rule in the reviewer prompts).

## Schema & migrations stay outer

`db/schema/<domain>.ts`, `pnpm db:generate`, `pnpm db:migrate` are infrastructure. The
core never imports a table object to reuse its column types — define the shape in
`@devdigest/shared` or `types.ts` and map.

## Sources
- [Drizzle ORM docs](https://orm.drizzle.team/) · [Transactions](https://orm.drizzle.team/docs/transactions)
- [Sentry: Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript)
- [Paul Serban: Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Hassan Javed: Drizzle ORM in production](https://www.hassanjaved.work/blog/drizzle-orm-patterns-production-2026)
- [Microsoft: Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)
- [Khalil Stemmler: DTOs, Mappers & the Repository pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- Counterpoint: [You might not need the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b)
