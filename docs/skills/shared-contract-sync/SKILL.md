---
name: shared-contract-sync
description: When a diff changes a route's request or response shape, check that the Zod contract in @devdigest/shared is changed in BOTH copies (server and client) and that client callers are updated; flag any drift.
type: convention
---

# Shared contract sync

In this codebase a Zod contract in `@devdigest/shared` is both the TypeScript type and
the route schema, and it exists twice:
`server/src/vendor/shared/**` and `client/src/vendor/shared/**`.

Flag:
- A route whose body/response shape changes while its contract in
  `server/src/vendor/shared` does not (the schema and the handler disagree).
- A contract changed in one copy but not the other — the client still sends/expects
  the old shape.
- Client code (`client/src/lib/hooks/*`, `api.*` calls) that still uses the old field
  names or URL after the change.
- A new required field on a stored/traced contract that is not `.nullish()` (old rows
  stop parsing).

Severity: **CRITICAL** when a caller will send or read the wrong shape at runtime;
**WARNING** for drift that does not break a call yet.
