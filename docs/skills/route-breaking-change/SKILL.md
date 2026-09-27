---
name: route-breaking-change
description: When a diff changes an HTTP route, compare old and new signature and report every change that breaks existing clients as CRITICAL — unless it is versioned or backward compatible.
type: rubric
---

# Route breaking change

Read the removed (`-`) and added (`+`) lines of every changed route and compare the
**signature** a client depends on:

| Part | Breaking when… |
|---|---|
| method + path | renamed, removed, method changed, path param renamed or reordered |
| params / query | a new **required** param, a param removed, its type narrowed |
| body schema | a new **required** field, a field renamed/removed, a type changed, an enum value removed |
| response | a field removed/renamed/retyped, nullability added, array ↔ object, pagination shape changed |
| status codes | a success code changed (200 → 201/204), an error code changed for the same case |

Rules:
- A breaking change to an existing route is **CRITICAL** — existing clients (the web
  studio, the CI runner, scripts) fail at runtime, and TypeScript does not catch it
  across the HTTP boundary.
- Not breaking: a new optional field or param, a new route, a new response field,
  a change behind a new version (`/v2/...`) with the old route kept.
- Name the concrete client call that breaks and the old → new shape. Cite the
  changed line in the route or schema.
- Say how to make it safe: keep the old field as deprecated, make the new field
  optional with a default, or add a versioned route.
