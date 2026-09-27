---
name: frontend-ui-architecture
description: "Where code goes in the DevDigest client (client/src, Next.js 15 App Router): which folder a new component, hook, constant, helper, type or piece of business logic belongs in, how to split a growing component, when to promote code to shared, and which imports/barrels are allowed. Use whenever you add or move a file under client/src, create a component or hook, extract constants/helpers from a component, split a large component or page, decide between _components / src/components / vendor/ui / lib, or review a client PR for structure — even if the user only says 'add a panel', 'refactor this component' or 'where should this go'."
metadata:
  version: 1.0.0
  updated: 2026-09-27
  scope: client/src (DevDigest studio)
---

# Frontend UI architecture — DevDigest client

Placement rules for `client/src`. The goal is that anyone (human or agent) can predict
where a piece of code lives from what it does and who uses it, and that deleting a
feature means deleting a folder. The rules follow one principle: **colocate by default,
promote only when a second consumer appears** (Kent C. Dodds' colocation + AHA).

This skill covers *where code lives and how it is split*. For how to write the inside of
a component (purity, effects, memoization) see `react-best-practices`; for RSC/route
file conventions see `next-best-practices`. Where `react-best-practices` →
"Code Organization" suggests `features/` or `utils/`, this skill wins for the client.

## The map

```
client/src/
├── app/                         routes = the features
│   └── <route>/
│       ├── page.tsx             thin: read params → render <Name>View
│       ├── constants.ts         route-wide constants (used by 2+ of its components)
│       ├── helpers.ts           route-wide pure functions
│       ├── styles.ts            route-level styles (`s`)
│       └── _components/         UI used only by this route (and its child routes)
│           └── <Name>/          one component folder, see "Component folder"
├── components/<kebab-name>/     app components reused by 2+ routes (AppShell, DiffViewer…)
├── lib/
│   ├── api.ts                   the only fetch client
│   ├── hooks/<domain>.ts        every server call: React Query / SSE hooks per domain
│   ├── <responsibility>.ts      shared pure logic named by what it does (github-urls.ts)
│   ├── *-context.tsx, providers.tsx, theme.tsx, toast.tsx   app-wide client state
│   └── types.ts                 re-exports of @devdigest/shared types
├── vendor/ui/                   @devdigest/ui design system: generic, domain-free primitives
├── vendor/shared/               @devdigest/shared Zod contracts (copy of the server's)
├── i18n/                        next-intl loader
└── test/                        setup + smoke test
messages/en/<namespace>.json     all user-visible strings
```

## Where does X go? (decision table)

Ask **"who uses it?"** before **"what is it?"**. Start at the narrowest scope that has
all current consumers; never place code for a consumer that doesn't exist yet.

| You have… | Used by… | Put it in |
|---|---|---|
| A component | one route | `app/<route>/_components/<Name>/` |
| A component | one parent component only | `<Parent>/_components/<Name>/` (nested) |
| A component | 2+ routes, knows DevDigest domain (PR, run, finding) | `src/components/<kebab-name>/` |
| A component | anywhere, domain-free (button, modal, chart) | `vendor/ui/<layer>/` + export from `vendor/ui/index.ts` |
| Trivial layout atoms (label+value rows) for one parent | one parent | `<Parent>/_components/atoms.tsx` — one file, no logic |
| Data from the API (query, mutation, SSE) | anyone | `lib/hooks/<domain>.ts` via `api.*` from `lib/api.ts` |
| A UI-only hook (keyboard, hover, positioning) | one component | `<Name>/use<Thing>.ts` in that folder |
| A UI-only hook | a shared component's parts | `components/<name>/hooks/use<Thing>.ts` |
| A constant (config, thresholds, enum→label/colour maps) | one component | `<Name>/constants.ts` |
| A constant | several components of one route | `app/<route>/constants.ts` |
| A constant | 2+ routes | the owning module in `lib/` (e.g. `lib/feature-models.ts`) or `@devdigest/ui` tokens if it is visual |
| A pure function (format, derive, sort, map DTO→view) | one component | `<Name>/helpers.ts` |
| A pure function | one route | `app/<route>/helpers.ts` |
| A pure function | 2+ routes | `lib/<responsibility>.ts` — named by what it does |
| A type | one file | inline in that file |
| A type | the API contract | `@devdigest/shared` (server copy first, then the client copy) |
| A type | several client files, not a contract | export it next to the code that owns it (`ActiveRun` in `lib/hooks/reviews.ts`) |
| Styles | one component | `<Name>/styles.ts`, exported as `s` |
| User-visible text | anywhere | `messages/en/<namespace>.json` + `useTranslations("<ns>")` |
| App-wide client state (active repo, theme, toasts) | many routes | a provider in `lib/*-context.tsx` / `lib/providers.tsx` |

## Component folder

```
<Name>/
├── <Name>.tsx        the component (named export, PascalCase = folder name)
├── index.ts          exactly: export { <Name> } from "./<Name>";
├── constants.ts      optional — only if there are constants
├── helpers.ts        optional — pure functions, no React
├── styles.ts         optional — `export const s = { … }` of CSSProperties
├── use<Thing>.ts     optional — UI hook used only here
├── <Name>.test.tsx   RTL test; helpers.test.ts for non-trivial helpers
└── _components/      optional — children used only by <Name>
```

Create only the files that have content — an empty `constants.ts` is noise. Route
components use PascalCase folders (`FindingsCell/`); shared app components in
`src/components/` use kebab-case folders (`run-cost-badge/`) with PascalCase files
inside. Keep that split, it is how the repo already reads.

## Splitting a component

Split when one of these is true — not because of a line count alone:

1. **It has two reasons to change.** A tab that renders a list *and* owns a filter bar →
   `FilterBar` + list. (Thinking in React: one component, one job.)
2. **A block has its own state or effects** that the rest doesn't need → move it down
   into a child so the state is colocated with its only reader and re-renders stay local.
3. **The JSX needs a comment to say what a block is** → that block is a named component.
4. **The file mixes pure logic with rendering.** Move derivations, formatting, sorting
   and geometry into `helpers.ts` (testable without React); move data access into a
   `lib/hooks` hook. The component then reads: hooks at the top, derived values, JSX.
5. **It grows past ~200–250 lines.** Treat as a prompt to look for 1–4, not a hard cap.

Do not split into a "container" and a "presentational" twin by default — a custom hook
already separates logic from markup. Do not extract a child that is used once and has
no state, no logic and < ~15 lines of JSX; inline is easier to read.

When a parent passes the same 5+ props through a child to a grandchild, or keeps adding
boolean props (`isCompact`, `isInline`, `showX`), prefer composition: pass `children`
or explicit variant components instead of more flags.

## Pages

`page.tsx` reads params/search params and renders one `<Name>View` from
`_components/`. Data fetching, filtering, sorting and tab logic go in the view, its
hooks and its helpers — not in the page. Two pages predate this rule and are fat
(`repos/[repoId]/pulls/page.tsx`, `repos/[repoId]/pulls/[number]/page.tsx`): don't grow
them; when you touch them, move the new logic into `_components/` or `helpers.ts`.

## Business logic: which layer

The client has no domain layer of its own — the server owns business rules (review,
grounding, scoring). What the client has, from outside in:

| Layer | Lives in | Contains | Must not contain |
|---|---|---|---|
| View | `*.tsx` components | JSX, event wiring, calling hooks | `fetch`, raw query keys, non-trivial calculations |
| UI state | `useState` in the lowest component that needs it; URL (`?tab=`, `?status=`) when it must survive reload/share | toggles, inputs, open/closed | server data copied into state |
| Server state | `lib/hooks/<domain>.ts` (React Query) | query keys, `queryFn`, invalidation, polling, `notify` on mutation | JSX |
| Transport | `lib/api.ts` | `apiFetch`, `ApiError`, base URL | domain knowledge |
| Pure logic | `helpers.ts` / `lib/<responsibility>.ts` | derivations, formatting, mapping DTO → view model | React, I/O |

Rules that follow from this:
- Components never call `fetch` or `api.*`; they call a hook from `@/lib/hooks`.
- Keep server data in React Query, not copied into `useState`/context — derive during
  render instead (react.dev "You Might Not Need an Effect").
- Query keys stay inside their domain file next to the hook that uses them; a mutation
  invalidates the keys of its own domain. Never build a key in a component.
- If logic would be duplicated with the server, it belongs on the server behind the
  contract; the client renders what the API returns (e.g. finding counts).

## Imports and boundaries

Allowed direction (arrows = "may import"):

```
app/<route>  ──►  components/  ──►  lib/  ──►  vendor/ui, vendor/shared
     └───────────────────────────────►┘
```

- `vendor/*` never imports from `app/`, `components/` or `lib/`.
- `lib/` never imports from `app/` or `components/`.
- `components/` never imports from `app/`.
- A route never imports from **another route's** `_components/` (private by name). If
  two routes need the same thing, promote it (see below) instead of a deep import like
  `@/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers`.
- Use `@/…` for anything outside the current route folder; `./` and `../` only within it.
  `@/` maps to `src/` only, so tests that load `messages/en/<ns>.json` keep a relative path.

### index.ts / barrels

- **Component folder:** a one-line `index.ts` re-exporting the component (and its public
  prop types if consumers need them). Import the folder: `from "./_components/PRRow"`.
- **Package entry points:** `@devdigest/ui` (always import UI from it, never a layer
  file) and `@devdigest/shared`.
- **Public surface of a shared component:** `components/<name>/index.ts` lists what is
  public, explicitly (`export { DiffViewer } …; export type { DiffCommentApi } …`).
- **Do not** add aggregating barrels, i.e. an `index.ts` that re-exports *several*
  modules of a folder (`components/index.ts`, `helpers/index.ts`). They create import
  cycles, slow tests, and hide where code lives. (`export * from "./PageShell"` in a
  component's own `index.ts` is a single re-export, not an aggregating barrel.)
  Existing exception: `lib/hooks/index.ts` — the data layer's entry point; add every
  new domain file to it.

## Promotion: when code moves up

Code starts local and moves up **when the second consumer appears**, not before:

1. Same route, second component needs it → move from `<Name>/helpers.ts` to the route's
   `helpers.ts` / `constants.ts`, or to the nearest common parent's folder.
2. Second route needs it → component to `src/components/<kebab-name>/`; pure function
   or constant to `lib/<responsibility>.ts`.
3. It turns out to be domain-free and generic → `vendor/ui` (with a showcase entry).

Move the code, its test and its i18n keys together, update imports, and leave no
re-export at the old path. Prefer a little duplication over an abstraction with one
real user or one that needs flags to serve both callers ("prefer duplication over the
wrong abstraction").

## Naming

- Components and their folders/files in routes: PascalCase, file name = component name.
- Hooks: `use<Thing>`; data hooks named after the resource (`usePrRuns`, `useDeleteRun`).
- `lib/` modules: kebab-case, named by responsibility (`github-urls.ts`,
  `model-label.ts`). Never `utils.ts`, `common.ts`, `misc.ts` — a generic name becomes a
  dumping ground.
- `helpers.ts` is fine *inside* a component or route folder: the folder already says
  whose helpers they are.
- Constants: `SCREAMING_SNAKE_CASE`, with a one-line doc comment for units or meaning
  (`/** Grace period to move the pointer into the card. */ CLOSE_DELAY_MS`).
- Keep nesting shallow: a `_components` inside a `_components` is fine; a third level
  means the middle component is doing too much or its children are really siblings.

## Checklist before finishing a client change

- [ ] Every new file is at the narrowest scope that covers its current consumers.
- [ ] No component calls `fetch`/`api.*`; new server calls are hooks in `lib/hooks/<domain>.ts` and exported from `lib/hooks/index.ts`.
- [ ] No import reaches into another route's `_components/`; no new `export *` barrels.
- [ ] Pure logic sits in `helpers.ts`/`lib/*.ts` with a test when it has branches.
- [ ] Strings are in `messages/en/<ns>.json`; colours use CSS variables / `SEV` tokens.
- [ ] Folder holds only files with content; `index.ts` is a single re-export.
- [ ] If something was promoted, the old path is gone and all imports point at the new one.

For worked examples from this repo (good placements and known deviations to fix when
touched), read `references/examples.md`.
