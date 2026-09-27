# Testing by ring

The payoff of the onion is that each ring can be tested without the ones outside it.
Tests live flat in `server/test/` (see `server/AGENTS.md` and `TESTING.md`).

| Ring | Test | Needs | Naming |
|---|---|---|---|
| `helpers.ts`, `pipeline/rank.ts`, reviewer-core | pure unit test: input → output | nothing | `<module>-helpers.test.ts` |
| `service.ts` (use cases) | unit test with **hand-written fakes of its ports** | nothing — no DB, no container, no keys | `<module>-service.test.ts` |
| `repository.ts` | integration test against real Postgres (testcontainers) | Docker | `*.it.test.ts` (MUST, if it imports `test/helpers/pg.ts`) |
| `adapters/**` | contract test of the adapter against its port; SDK stubbed | nothing | `adapters.test.ts` |
| `routes.ts` | `buildApp({ config, overrides })` + `app.inject()` | mocks from `adapters/mocks.ts`; DB only for `*.it.test.ts` | `routes-smoke.test.ts`, `<module>.it.test.ts` |

## Service test with fakes (the target shape)

```ts
const repo: AgentsRepo = {
  list: async () => [],
  findById: async (_ws, id) => (id === 'a1' ? agentFixture : null),
  transaction: (work) => work(repo),
  // …only what the use case touches
};
const service = new AgentsService({ repo, llm: async () => new MockLLMProvider() });

await expect(service.get('ws', 'missing')).rejects.toBeInstanceOf(NotFoundError);
```

If a service test needs a `Container`, a DB or `vi.mock` of a module path, the service
has an undeclared dependency — fix the design (add it to `…Deps`), not the test.

## Rules
- Unit tests never hit the network or require API keys; LLM/GitHub come from
  `adapters/mocks.ts` or inline fakes.
- Don't unit-test Drizzle queries with mocks of `db.select()` — test repositories
  against real Postgres in `*.it.test.ts`.
- `NODE_ENV=test` silences logs and disables rate limiting.

## Sources
- [Alistair Cockburn: Hexagonal architecture — "driven by… automated tests"](https://alistair.cockburn.us/hexagonal-architecture)
- [Khalil Stemmler: Application layer use cases](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/)
