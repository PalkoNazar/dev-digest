# onion-architecture — sources and design decisions

Research log behind `SKILL.md`. Tier: **A** = original author / official docs,
**B** = widely cited practitioner or reference repo, **C** = supporting material or a
counterpoint.

Questions the skill answers:

- **Q1** Which ring does a piece of backend code belong to?
- **Q2** Which imports are allowed between rings?
- **Q3** How does a service get its dependencies?
- **Q4** Where do Fastify, Drizzle, SDKs, jobs and SSE live?
- **Q5** Where does untrusted data get parsed?
- **Q6** How is the architecture enforced and how is legacy migrated?

## 1. Onion, Hexagonal, Clean: the originals

| # | Source | Tier | Answers | Key takeaway |
|---|---|---|---|---|
| 1 | [Jeffrey Palermo: The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [series](https://jeffreypalermo.com/tag/onion-architecture/) · [original sample](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture) | A | Q1 Q2 | Domain model at the centre, then domain services, application services, and infrastructure/UI/tests outside. What differs from classic layering is the **direction of coupling**: everything points to the centre, infrastructure is externalized behind interfaces. |
| 2 | [Robert C. Martin: The Clean Architecture (2012)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | A | Q2 Q5 | The Dependency Rule says source dependencies only point inward. Inner circles don't name outer ones, and outer data formats (framework- or ORM-generated) don't cross inward. |
| 3 | [Alistair Cockburn: Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture) | A | Q3 Q4 | The app is driven equally by UI, tests and scripts, and it drives DBs and services through ports. Adapters translate at the edge, and the app can be tested in isolation. |
| 4 | [Herberto Graça: Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) · [Explicit Architecture: DDD, Hexagonal, Onion, Clean, CQRS](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | B | Q1 Q3 Q4 | Brings the models together: primary/secondary adapters, application core (application layer + domain layer), ports owned by the core, and components (feature slices) cutting across the layers. |
| 5 | [Oliver Drotbohm: Sliced Onion Architecture](http://odrotbohm.github.io/2023/07/sliced-onion-architecture/) | B | Q1 Q2 | Slice by feature first, then apply the onion rings inside each slice. This matches `modules/<name>/` exactly. |
| 6 | [AWS Prescriptive Guidance: Hexagonal architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html) · [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) | C | Q3 | A concise summary of ports/adapters and its testing benefits. |

## 2. Application layer, DI, mapping

| # | Source | Tier | Answers | Key takeaway |
|---|---|---|---|---|
| 7 | [Khalil Stemmler: Application Layer Use Cases](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/application-layer-use-cases/) | B | Q1 Q3 | Use cases (application services) fetch what they need through repositories and run domain logic, independent of HTTP. |
| 8 | [Khalil Stemmler: DTOs, Mappers & the Repository pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | B | Q4 | The repository hides the ORM, and a mapper converts persistence ↔ domain ↔ DTO. That is why rows don't leave repositories. |
| 9 | [Mark Seemann: Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/) · [Service Locator violates encapsulation](https://blog.ploeh.dk/2015/10/26/service-locator-violates-encapsulation/) | A | Q3 | A locator hides preconditions and gives access to unbounded dependencies. Use constructor injection plus a single Composition Root. |
| 10 | [Jimmy Bogard: Service Locator is not an Anti-Pattern](https://www.jimmybogard.com/service-locator-is-not-an-anti-pattern/) | C | Q3 | Counterpoint: a locator is acceptable *at the infrastructure edge*. We allow `app.container` in `routes.ts` for exactly that reason. |

## 3. Tool-specific practice

| # | Source | Tier | Answers | Key takeaway |
|---|---|---|---|---|
| 11 | [Fastify: Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) · [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) · [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) · [fastify-plugin](https://github.com/fastify/fastify-plugin) | A | Q4 | `register` creates an encapsulated context (a DAG). The plugin system is lightweight DI, so a module is one plugin. |
| 12 | [Luxlorys/fastify-clean-template](https://github.com/Luxlorys/fastify-clean-template) | B | Q3 Q4 | A framework-free core with ports at the I/O boundary, wired with Fastify idioms instead of a DI framework. This is our model too. |
| 13 | [Snyk: Fastify plugins as building blocks](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/) | C | Q4 | Isolated plugin components with their own routes and decorators. |
| 14 | [Drizzle ORM docs](https://orm.drizzle.team/) · [Transactions](https://orm.drizzle.team/docs/transactions) | A | Q4 | `db.transaction(async (tx) => …)` rolls back when the callback throws. `tx` scopes the work. |
| 15 | [Sentry: Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) | B | Q4 | The service owns the transaction boundary. Repositories stay reusable inside or outside a transaction. This is our `transaction(work)` port. |
| 16 | [Paul Serban: Drizzle ORM best practices](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) · [Hassan Javed: Drizzle in production](https://www.hassanjaved.work/blog/drizzle-orm-patterns-production-2026) | C | Q4 | Per-resource repository modules keep queries out of handlers. Table-level repositories are fine for small apps. |
| 17 | [Microsoft: Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) | B | Q4 | Repository interfaces belong to the domain side, and implementations to infrastructure. |
| 18 | [Jay Freestone: You might not need the repository pattern](https://dev.to/jayfreestone/you-might-not-need-the-repository-pattern-46b) | C | Q4 | Counterpoint: modern ORMs are typed query builders, so don't build entity mappers you don't need. That's why our domain model is plain Zod contracts. |
| 19 | [Zod docs](https://zod.dev/) · [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | A | Q5 | Parse untrusted input into a typed value once, at the boundary, then trust it. |
| 20 | [Steve Kinney: Zod best practices](https://stevekinney.com/courses/full-stack-typescript/zod-best-practices) · [hyper: Zod in Ports & Adapters](https://blog.hyper.io/using-zod-to-parse-function-schemas/) | C | Q5 | Validate at architectural boundaries and don't re-parse the same object in each layer. |

## 4. Enforcement

| # | Source | Tier | Answers | Key takeaway |
|---|---|---|---|---|
| 21 | [dependency-cruiser: rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) · [options reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md) | A | Q6 | `forbidden` rules with `from/to/path/pathNot`, group back-references (`$1`), `tsPreCompilationDeps`, and a known-violations baseline (`depcruise-baseline`, `--ignore-known`). |
| 22 | [Ken Miyashita: Validate dependencies according to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) | B | Q6 | Encodes the Clean Architecture rings as dependency-cruiser rules. |
| 23 | [Xebia: Taking frontend architecture serious with dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) · [Atomic Object: Restrict imports](https://spin.atomicobject.com/dependency-cruiser-imports/) · [DEV: Avoid cross-module dependencies](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) | C | Q6 | Treats the architecture as a fitness function in CI, including module-boundary rules. |
| 24 | [Remo Jansen: Enforce Clean Architecture with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) | C | Q6 | An alternative tool built for onion layers. We use dependency-cruiser because it is already a dependency. |

## Design decisions

1. **Pragmatic onion, not full DDD.** The domain model is the Zod contracts in
   `@devdigest/shared` plus pure functions. There are no entity classes, aggregates or DI
   framework (#18, and the course-starter scope in the root `AGENTS.md`).
2. **Two composition points.** `platform/container.ts` builds shared ports, and each
   module's `routes.ts` builds its own service. Both sit in the outer ring, so reading
   `Container` there is legitimate (#9, #10, #12). Everywhere else it counts as a service
   locator.
3. **Ports live next to their consumer.** External systems go in
   `vendor/shared/adapters.ts` (already the convention). Module seams go in
   `modules/<m>/ports.ts` (#3, #17).
4. **Repositories return contracts.** Mapping moves into the persistence ring (#8, #2),
   and `db/rows.ts` becomes repository-only.
5. **The service owns transactions** through a `transaction(work)` port method (#15).
6. **Pure libraries are allowed in the core.** graphology and p-queue do no I/O and don't
   leak a vendor. Only I/O SDKs are adapter-only.
7. **`AppError.statusCode` is tolerated.** It is a small HTTP leak without a Fastify
   import. Moving the mapping into the error handler is not worth the churn right now.
8. **Enforced by a machine, with a shrinking baseline.** Legacy code is frozen in
   `.dependency-cruiser-known-violations.json` instead of being rewritten in this change
   (#21). The migration order is in `references/migration.md`.
9. **This skill wins over generic skills.** `fastify-best-practices` builds services as
   Fastify decorators over `fastify.db`, and `drizzle-orm-patterns` queries with no
   repository boundary. For DevDigest the ring rules take precedence.
