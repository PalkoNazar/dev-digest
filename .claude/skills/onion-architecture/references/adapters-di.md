# Ports, adapters and the composition root

## Port → adapter → mock → container

Every outside system (LLM, GitHub, git, code search, embeddings, secrets, auth, tokenizer,
dependency graph) follows the same four steps — this is what keeps unit tests key-free:

1. **Port** — an interface in `vendor/shared/adapters.ts` (external system) or
   `modules/<m>/ports.ts` (module-local seam). Written in domain terms: `getPull(ref)`,
   not `octokit.rest.pulls.get`.
2. **Adapter** — `adapters/<x>/<impl>.ts` implements it. The only place its SDK is
   imported. It maps SDK types to shared types and turns SDK failures into
   `ExternalServiceError` / `ConfigError`.
3. **Mock** — `adapters/mocks.ts` gets a deterministic fake.
4. **Wiring** — `platform/container.ts`: a lazy getter plus a `ContainerOverrides` field.
   Key-backed adapters resolve their secret in the getter and throw `ConfigError` when
   it's missing; call `invalidateSecretCaches()` after saving a key.

Adapters never import `modules/**` or the container. If an adapter needs a constant a
module also uses (`SUPPORTED_EXT`), the constant belongs to the adapter or to shared.

## Composition root, not service locator

`Container` builds everything, but it must only be *read* at the edges:
`platform/container.ts` itself, `app.ts`, and each module's `routes.ts`.

```ts
// ❌ service locator: hidden, unbounded dependencies; untestable without a container
class ReviewService {
  constructor(private container: Container) {}
  async run() { const llm = await this.container.llm('openai'); /* … */ }
}

// ✅ explicit, narrow dependencies
interface ReviewDeps {
  reviews: ReviewRepo;
  agents: AgentsRepo;
  llm: (p: Provider) => Promise<LLMProvider>;   // lazy factory keeps local-first degrade
  jobs: JobQueue;
  events: RunEvents;
}
class ReviewService { constructor(private readonly deps: ReviewDeps) {} }
```

Signs of a leak: `import type { Container }` in a service; a service calling
`new SomethingRepository(...)`; a cycle `service → container → service`
(`container.repoIntel` building `RepoIntelService(this)` is today's example).

Shared ports (used by 2+ modules — `agentsRepo`, `reviewRepo`, `repoIntel`) are getters on
the container. Module-local repositories are built in that module's `routes.ts`.

## Jobs (p-queue `JobRunner`)

`JobRunner` is infrastructure (queue + `jobs` table). The core sees a port:

```ts
// ports.ts
export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
}
```

- The service calls `deps.jobs.enqueue(ws, CLONE_JOB, { repoId })`.
- `routes.ts` registers the handler: `c.jobs.register(CLONE_JOB, (p) => service.clone(ClonePayload.parse(p)))`.
- Job kinds and payload schemas live in the module's `constants.ts` / `types.ts`.

## Live events (SSE `runBus`) and run logs

`runBus` / `RunLogger` are concrete platform singletons. Give the core a narrow port:

```ts
export interface RunEvents {
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): void;
  isCancelled(runId: string): boolean;
}
```

Inject `c.runBus` (it satisfies the port structurally) or a `RunLogger` built at the edge.
The SSE route subscribes to `runBus` directly — it is the edge.

## reviewer-core and the LLM port

`reviewer-core` is the pure domain engine: diff → prompt → `LLMProvider` → structured
output → `groundFindings`. The server passes an `LLMProvider` in; reviewer-core never
reads keys, env, DB or files. The OpenRouter adapter living in `reviewer-core/src/llm/` is
a known exception (shared with the CI runner); it still only implements the port.

## Sources
- [Alistair Cockburn: Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture)
- [Mark Seemann: Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/) ·
  [Service Locator violates encapsulation](https://blog.ploeh.dk/2015/10/26/service-locator-violates-encapsulation/)
- Counterpoint: [Jimmy Bogard: Service Locator is not an Anti-Pattern](https://www.jimmybogard.com/service-locator-is-not-an-anti-pattern/)
- [Herberto Graça: Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- [AWS Prescriptive Guidance: Hexagonal architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html)
