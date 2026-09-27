# Zod contracts: the domain model and the boundary parsers

## Contracts are the innermost ring

`@devdigest/shared` (`server/src/vendor/shared`) holds Zod schemas whose `z.infer` types
*are* the domain model (`Agent`, `Finding`, `Review`, `RunTrace`…) and the adapter ports
(`adapters.ts`). Because they sit at the centre:

- `vendor/shared/**` imports only `zod` and itself (`shared-is-innermost` rule).
- A shape that crosses HTTP or reaches the client is a shared contract. Change it first,
  then the server, then the client — and update **both copies** (server and
  `client/src/vendor/shared`; they already differ, so diff before editing).
- A shape that stays inside one module's core is a plain type in `modules/<m>/types.ts`
  (e.g. `CreateAgentInput`), not a shared contract.
- Don't derive domain types from Drizzle tables (`typeof t.x.$inferSelect`) — that makes
  the centre depend on the DB. Map rows to contracts in the repository.

## Parse, don't validate — once, at each boundary

Untrusted data becomes a typed value exactly where it enters; the core then trusts it.

| Boundary | Where the parse happens | How |
|---|---|---|
| HTTP request | `routes.ts` | `schema: { params, querystring, body }` via `fastify-type-provider-zod` |
| HTTP response (optional) | `routes.ts` | `schema.response` — serialization failures become a generic 500 |
| Job payload (`unknown`) | the handler registered in `routes.ts` | `Payload.parse(payload)` before calling the service |
| LLM output | adapter / reviewer-core | `platform/structured.ts` → `parseWithRepair` (don't hand-roll JSON parsing) |
| GitHub / git data | the adapter | map SDK types to shared types before returning |
| DB rows | repository | trusted (schema-typed) — map, don't re-parse |
| Config / env | `platform/config.ts` | one Zod parse at boot |

Inside the core: no `safeParse` of values that already crossed a boundary, no `as` casts
to paper over an unparsed `unknown`.

## Sources
- [Zod docs](https://zod.dev/)
- [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [Steve Kinney: Zod best practices](https://stevekinney.com/courses/full-stack-typescript/zod-best-practices)
- [hyper: Using Zod to parse function schemas (Ports & Adapters)](https://blog.hyper.io/using-zod-to-parse-function-schemas/)
- [Uncle Bob: data formats of an outer circle must not be used by an inner circle](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
