---
name: breaking-change
description: When a diff changes or removes part of a public API — route, method, path/query param, request body field, status code, exported contract type — compare old vs new and report every change that breaks an existing client as CRITICAL, unless the old shape is kept or the change sits behind a new version.
type: rubric
---

# Breaking change

A public contract is anything a caller outside this PR relies on: an HTTP route
(method, path, params, query, request body, status codes, error envelope), a
Zod schema / type exported from a shared contracts package, a CLI flag, an event
payload. Read the removed (`-`) and added (`+`) lines and ask one question:
**would a client written against the old version still work, unchanged?**

| Part | Breaking when… |
|---|---|
| method + path | route removed or renamed, method changed, path param renamed/reordered |
| path / query params | a new **required** param, a param removed or renamed, its type narrowed (`string` → `uuid`, `number` → `int().positive()`) |
| request body | a new **required** field, a field removed/renamed, a type changed, an enum value **removed**, `.optional()` dropped, `.strict()` added |
| status codes | a success code changed (`200` → `201`/`204`), an error code changed for the same case (`404` → `400`) |
| errors | the error envelope shape changed, an error `code` string renamed |
| exported contract | a shared type/schema field removed or renamed, a default changed that alters behaviour |

Response-body shape (field types, nullability, required → optional) is covered by
the `response-schema` skill — don't report it twice.

## Bad — flag it

```diff
- app.get('/reviews/:id', { schema: { params: z.object({ id: z.string() }) } }, getReview);
+ app.get('/review/:reviewId', { schema: { params: z.object({ reviewId: z.string().uuid() }) } }, getReview);
```

Path renamed, param renamed, type narrowed — every existing `GET /reviews/42` now 404s.
**CRITICAL**.

```diff
  export const CreateAgentInput = z.object({
    name: z.string(),
-   model: z.string().optional(),
+   model: z.string(),
+   provider: z.enum(['openai', 'anthropic']),
  });
```

Two new required fields — every client that omitted them now gets 400. **CRITICAL**.

## Good — do not flag

```diff
  app.get('/reviews/:id', { schema: { params: z.object({ id: z.string() }) } }, getReview);
+ app.get('/v2/reviews/:reviewId', { schema: { params: V2Params } }, getReviewV2);
```

New versioned route, old one kept — additive.

```diff
  export const CreateAgentInput = z.object({
    name: z.string(),
    model: z.string().optional(),
+   provider: z.enum(['openai', 'anthropic']).default('openai'),
  });
```

New field is optional with a default that keeps the old behaviour — safe.

## Rules

- A breaking change to an existing, released contract is **CRITICAL** — TypeScript
  does not catch it across an HTTP boundary; clients fail at runtime.
- Not breaking: a new route, a new **optional** param/field, a widened input type,
  a new enum value in a **request** enum, a change behind a new version with the old
  one kept.
- If the contract and **all** of its callers change in the same PR (e.g. shared
  schema + server + client together, internal-only route), it is at most a
  **WARNING** — say which callers you checked. If a caller outside the diff could
  exist (CI runner, scripts, other services), keep it CRITICAL.
- In every finding name the old → new shape and the concrete call that breaks, cite
  the changed line, and give the safe alternative: keep the old field/route as
  deprecated, make the new field optional with a default, or add a versioned route.
