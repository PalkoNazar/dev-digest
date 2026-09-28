---
name: response-schema
description: When a diff changes what an endpoint returns — response schema, serializer, DTO mapper or handler return value — check field types, required/optional, nullability and shape; flag any change that makes an existing client read a missing, null or differently typed value, and any drift between the declared schema and what the handler actually returns.
type: rubric
---

# Response schema

A client reads a response with assumptions: this field exists, it is a string, it is
never `null`, `items` is an array. The response is the contract **in the opposite
direction** from the request: loosening a response is what breaks clients.

| Change in the response | Verdict |
|---|---|
| field removed or renamed | **CRITICAL** |
| type changed (`number` → `string`, `string` → object, ISO date → epoch) | **CRITICAL** |
| required → optional, or `.nullable()` added | **CRITICAL** — `res.user.name.length` now throws |
| array ↔ object, bare list → `{ items, next_cursor }` envelope | **CRITICAL** |
| new value in a response **enum** | **WARNING** — breaks exhaustive `switch`/`Record<Enum, …>` in clients |
| new field added | safe |
| optional → required, nullable → non-null (tightening) | safe |

## Schema ↔ handler drift

The declared response schema and the value the handler returns must match:

- A field returned by the handler but **missing from the response schema** is
  silently stripped by the serializer (Fastify/`fast-json-stringify`, Zod `.parse`)
  — the feature ships "done" but the client never sees the field. **WARNING**.
- A field **declared required** in the schema that the handler can leave
  `undefined` (conditional spread, optional DB column, `?.`) → serialization error
  or a lie in the contract. **WARNING**, CRITICAL if it is on the happy path.
- DB rows returned straight to the client (`return row`) leak internal columns and
  couple the API to the table shape. **WARNING**.

## Bad — flag it

```diff
  export const Review = z.object({
    id: z.string(),
-   score: z.number(),
-   author: z.object({ login: z.string() }),
+   score: z.string(),
+   author: z.object({ login: z.string() }).nullable(),
  });
```

`score` changed type and `author` became nullable — `review.score.toFixed(1)` and
`review.author.login` now fail in every existing client. **CRITICAL**, two findings.

```ts
// schema declares { id, title }; handler now also returns `cost_usd`
return { id: run.id, title: run.title, cost_usd: run.costUsd };
```

`cost_usd` is not in the response schema — it is stripped before it reaches the
client. **WARNING**: add it to the contract.

## Good — do not flag

```diff
  export const Review = z.object({
    id: z.string(),
    score: z.number(),
+   score_breakdown: z.record(z.number()).optional(),
  });
```

Additive, optional — old clients ignore it.

```diff
- score: z.number().nullable(),
+ score: z.number(),
```

Tightening: every old client already handled a number.

## Rules

- Compare old vs new **response** shape field by field, including nested objects and
  array item schemas. Cite the schema line, name the field path (`author.login`) and
  the old → new type.
- Safe alternative to suggest: add the new field next to the old one and deprecate
  the old one; keep types stable and add a new field for a new representation; put
  a real shape change behind a new version.
- Request-side and route-level changes belong to the `breaking-change` skill —
  don't report the same line twice.
