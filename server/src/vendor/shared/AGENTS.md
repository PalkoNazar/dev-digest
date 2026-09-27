# @devdigest/shared (server copy)

Zod contracts + port interfaces shared by server, reviewer-core and client.
Types and runtime schemas come from ONE definition (`z.infer`); routes use them
directly as Fastify schemas.

## Gotchas
- A second copy lives in `client/src/vendor/shared`. They have ALREADY drifted
  (`adapters.ts`, `contracts/trace.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`).
  Change a contract → apply the same edit to the client copy, or state why not.
  Check: `diff -r server/src/vendor/shared client/src/vendor/shared`
- reviewer-core imports THIS copy via a `../server/...` path alias.
- Many contracts serve future lessons (eval, ci, knowledge, brief) — not dead code.
- API JSON is snake_case (`head_sha`, `files_count`); DB/TS rows are camelCase —
  map explicitly at the route boundary.
