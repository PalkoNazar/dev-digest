# server/modules

One folder = one Fastify plugin = one feature.

## Adding a module
1. `modules/<name>/routes.ts` default-exports the plugin
   (`appBase.withTypeProvider<ZodTypeProvider>()`).
2. Register it with ONE import + ONE entry in `index.ts` (this folder)
   (static on purpose — no autoload; dynamic import of .ts is not portable).
3. Split: `routes.ts` (edge + wiring) → `service.ts` (takes a `…Deps` from `ports.ts`,
   never `Container`) → `repository.ts` (implements the port), plus `helpers.ts` (pure)
   and `constants.ts`. Full rules: skill `onion-architecture`; `pnpm arch:check`.

## Rules
- Start every handler with `getContext(container, req)` (`_shared/context.ts`) and
  scope queries by `workspaceId`. Reuse `_shared/schemas.ts` (`IdParams`, …).
- Declare Zod `params`/`body` on the route; don't `Schema.parse(req.body)` by hand.
- Cross-module data goes via `container.<repo>` (e.g. `agentsRepo`, `reviewRepo`,
  `repoIntel`) — never import another module's folder.
- Long work (clone, index, import) → `container.jobs`, not inline in the request.

## Gotchas
- `pulls`, `polling`, `workspace` are routes-only (Drizzle inside handlers) — legacy
  shape, don't copy it into new modules.
