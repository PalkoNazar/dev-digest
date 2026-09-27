# client — `@devdigest/web`

Next.js 15 studio on :3000. Talks only to the Fastify API (`NEXT_PUBLIC_API_BASE`,
default `http://localhost:3001`) — no DB, no LLM, no GitHub calls from here.

## Commands
`pnpm dev` · `pnpm typecheck` · `pnpm test` (vitest + jsdom, fetch mocked — no API needed)

## Layout
- `src/app/` — routes (App Router) → `src/app/AGENTS.md`
- `src/lib/` — `api.ts` fetch client + TanStack Query hooks → `src/lib/AGENTS.md`
- `src/components/` — cross-page components (app-shell, diff-viewer, …)
- `src/vendor/ui` — design system `@devdigest/ui`; `src/vendor/shared` — Zod contracts
- `messages/en/<namespace>.json` — UI strings (next-intl, one file per feature)

## Conventions
- Aliases: `@/*` → `src/*`, `@devdigest/ui`, `@devdigest/shared` (mirrored in
  `vitest.config.ts` — add a new alias in BOTH tsconfig and vitest config).
- Component folder: `Name/{Name.tsx, index.ts, constants.ts, helpers.ts, styles.ts, Name.test.tsx}`.
- Styling: CSS variables + `styles.ts` objects (`CSSProperties`) exported as `s`.
  Tailwind is loaded by the design system but NOT used for component styling.
- All user-visible strings via `useTranslations("<ns>")`; add keys to `messages/en/<ns>.json`.
- Import UI only from the `@devdigest/ui` barrel, never from its layer files.

## Gotchas
- `src/vendor/shared` is a COPY of `server/src/vendor/shared` and has drifted
  (e.g. `LLMProvider.id` lacks `'openrouter'` here). Sync with the server copy.
- `messages/en/` already holds namespaces for future lessons (blast, eval, memory…).

## Docs
Route map: `README.md` · design system: `src/vendor/ui/README.md` ·
deep dives: `docs/` · specs: `specs/` · learned: `INSIGHTS.md`
