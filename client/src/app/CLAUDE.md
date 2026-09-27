# client/src/app

App Router routes. Pages are thin; feature UI lives in colocated `_components/`.

## Rules
- `page.tsx` only reads params and renders a `_components/<Name>View`; data fetching
  goes through hooks from `@/lib/hooks`, not `fetch` in the page.
- Feature-local components → `<route>/_components/<Name>/`; reused across routes →
  `client/src/components/`.
- Each component folder carries its own `*.test.tsx` (RTL + jsdom).
- Prefer `@/…` imports over deep `../../../../` relative paths.

## Gotchas
- `repos/[repoId]/pulls/[number]/page.tsx` is the exception: a fat client page
  (tabs, runs, cancel). Don't grow it — put new logic in its `_components/`.
  Tab state lives in the URL (`?tab=`).

## Map
- `/` → redirects to the first repo's PR list
- `/onboarding` — add repo · `/repos/[repoId]/pulls` — PR list
- `/repos/[repoId]/pulls/[number]` — review detail (overview · diff · findings, Live Log)
- `/agents`, `/agents/[id]` — agent list + editor · `/settings/[section]` — keys, models
