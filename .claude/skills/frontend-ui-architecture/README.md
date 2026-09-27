# Frontend UI Architecture skill

**Version:** 1.0.0 · **Updated:** 2026-09-27 · **Scope:** `client/src` (DevDigest studio)

## Motivation

The client already had strong local conventions: component folders, `_components/`, and
data access through `lib/hooks`. They were scattered across three `AGENTS.md` files and
partly contradicted `react-best-practices` → "Code Organization", which suggests a
generic `features/` and `utils/` layout. This skill puts the placement rules in one
place. It answers:

- Where do components live, and how are they split?
- Where do constants go? What goes into helpers and what goes into `lib/`?
- Where does business logic live (view, UI state, server state, transport, pure logic)?
- Which imports and barrels are allowed, and when does code get promoted to shared?

The rules come from the research below and are then fitted to the code that already
exists in this repo.

## Files

| File | What it holds | When it is loaded |
|---|---|---|
| `SKILL.md` | Map, decision table, splitting, business-logic layers, import rules, promotion, naming, checklist | Every time the skill triggers |
| `references/examples.md` | Real placements to copy, known deviations with their fixes, "where does this go?" walkthroughs | When a concrete example is needed |
| `README.md` | This file: motivation, decisions, sources, changelog | Not loaded by the agent |

Related skills: `react-best-practices` (component internals), `next-best-practices`
(RSC and file conventions), `react-testing-library` (tests).

## Design decisions (v1.0.0)

The sources disagree on four points. The first three were decided with the repo owner
on 2026-09-27; the fourth follows from the colocation principle the skill is built on.

1. **Scope: DevDigest only.** The rules name real paths in `client/src` and are not
   meant to be a generic React guide. Generic guidance stays in `react-best-practices`.
2. **Barrels: narrow `index.ts` only.**
   - Allowed: a one-line `index.ts` per component folder, the package entry points
     `@devdigest/ui` and `@devdigest/shared`, and an explicit public surface for a
     shared component.
   - Not allowed: aggregating `export *` barrels.
   - Existing exception: `lib/hooks/index.ts`.

   This is a compromise between TkDodo and bulletproof-react (no barrels) and Wieruch
   and Comeau (`index.ts` as a public API).
3. **helpers / utils / lib: split by scope.**
   - `helpers.ts` holds pure functions for one component or route and sits next to it.
   - `lib/<responsibility>.ts` holds code shared by two or more routes, named by what
     it does.
   - There is no catch-all `utils.ts`.
4. **Feature-first via routes.** Next.js route folders with `_components/` act as the
   feature folders, so there is no separate `features/` directory. Code is promoted
   when a second consumer appears (Wieruch's "one feature → local, 2+ → shared" rule,
   combined with Dodds' AHA principle).

## Versioning

The version is kept in `SKILL.md` frontmatter (`metadata.version`) and in this file.

- **Patch:** wording, examples, or fixed facts.
- **Minor:** a new rule or section that doesn't contradict an old one.
- **Major:** a rule changes direction (for example, the barrel policy), or the scope
  changes.

Add a line to the changelog with every bump.

## Sources

Tier: **A** = official docs, **B** = widely cited author or reference repo,
**C** = supporting material or a counterpoint.

### Official docs

- **A** [Next.js: Project structure & organization](https://nextjs.org/docs/app/getting-started/project-structure).
  Colocation in `app/`, private `_folders`, route groups, and three organisation
  strategies. The underlying principle is "pick one and be consistent".
- **A** [Next.js: Data Security (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security).
  Centralise data access in one layer and keep actions and components thin.
- **A** [Next.js blog: How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions).
  Recommends a data access layer (DAL) over queries scattered through components.
- **A** [React (legacy): File Structure FAQ](https://legacy.reactjs.org/docs/faq-structure.html).
  Group by feature or route, nest at most 3–4 levels, and don't spend more than
  5 minutes choosing a structure.
- **A** [react.dev: Thinking in React](https://react.dev/learn/thinking-in-react).
  One component, one job. Keep state minimal and derive the rest.
- **A** [react.dev: Keeping Components Pure](https://react.dev/learn/keeping-components-pure).
  Also [Rules: components & hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure).
- **A** [react.dev: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure).
  No redundant or duplicated state.
- **A** [react.dev: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks).
  Hooks let the component express intent while the hook holds the mechanics.
- **A** [react.dev: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).
  Derive during render instead of syncing state with an effect.

### Reference architectures

- **B** [bulletproof-react: project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  ([repo](https://github.com/alan2207/bulletproof-react)). Imports flow one way,
  shared → features → app. No cross-feature imports, no barrels.
- **B** [Feature-Sliced Design: Layers](https://feature-sliced.design/docs/reference/layers).
  Also [Slices & segments](https://feature-sliced.design/docs/reference/slices-segments)
  and [Overview](https://feature-sliced.design/docs/get-started/overview). A module
  imports only from layers strictly below it. Segments are
  `ui / api / model / lib / config`.
- **B** [Martin Fowler / Juntao Qiu: Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html).
  Layers are view → hooks → domain → data access. Business logic moves out of components.
- **B** [Vercel agent-skills: react-best-practices](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md).
  Also the [announcement](https://vercel.com/blog/introducing-react-best-practices).
  Used as a reference for the skill format.
- **B** [Vercel agent-skills: composition-patterns](https://github.com/vercel-labs/agent-skills/blob/main/skills/composition-patterns/SKILL.md).
  Compound components and explicit variants instead of boolean props.

### Structure, colocation, abstraction

- **B** [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation).
  Place code as close to where it's relevant as possible.
- **B** [Kent C. Dodds: State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster).
- **B** [Kent C. Dodds: Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react).
  Keep the server cache separate from UI state.
- **B** [Kent C. Dodds: AHA Programming](https://kentcdodds.com/blog/aha-programming).
  Prefer duplication over the wrong abstraction.
- **B** [Robin Wieruch: React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/).
  Five steps from one file to feature folders. Used by one feature → local; used by
  2+ → shared.
- **B** [Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/).
  Component folders with `helpers` and `constants` files. Helpers are project-specific;
  utils are generic.
- **B** [Alex Kondov: Tao of React](https://alexkondov.com/tao-of-react/).
  Module-based structure and separating business logic from UI.
- **B** [Dan Abramov: Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0).
  The 2019 note says he no longer recommends this split; hooks replaced it.
- **C** [react-file-structure.surge.sh](https://react-file-structure.surge.sh/).
  "Move files around until it feels right."
- **C** [Profy: Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure).
- **C** [Sandro Roth: How to structure your React projects](https://sandroroth.com/blog/project-structure/).
- **C** [Max Rozen: Guidelines to improve your React folder structure](https://maxrozen.com/guidelines-improve-react-app-folder-structure).

### Data layer

- **B** [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query).
  Wrap each query in a custom hook.
- **B** [TkDodo: Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys).
  Keep query keys next to their queries, not in a global file.
- **B** [TkDodo: The Query Options API](https://tkdodo.eu/blog/the-query-options-api).

### Imports, barrels, enforcement

- **B** [TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files).
- **C** [Codecompose: Why I Prefer Barrel Files in 2026](https://codecompose.com/articles/why-i-prefer-barrel-files-in-2026/).
  Counterpoint: a barrel as a narrow public API.
- **B** [JS Boundaries / eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/overview/)
  ([npm](https://www.npmjs.com/package/eslint-plugin-boundaries)). Enforces import
  boundaries with a lint rule. The client has no ESLint yet, so this is a candidate
  for later.

### Naming

- **B** [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react).
  PascalCase; the file name matches the component name.
- **C** [The utility module antipattern](https://www.yanglinzhao.com/posts/utils-antipattern/).
  Also [Dunghill anti-pattern](https://mattilehtinen.com/articles/dunghill-anti-pattern-why-utility-classes-and-modules-smell/).
  `utils.ts` tends to become a dumping ground.

### In-repo sources

- `client/AGENTS.md` (component folder convention, i18n, `@devdigest/ui` imports)
- `client/src/app/AGENTS.md` (thin pages, `_components/`)
- `client/src/lib/AGENTS.md` (hook → `api.ts`, never `fetch` in components)
- `client/src/components/AGENTS.md`
- `client/src/vendor/ui/README.md`

## Changelog

- **1.0.0** (2026-09-27): First version. Covers the map, the "where does X go" table,
  splitting, business-logic layers, import rules and barrels, promotion, naming, the
  checklist, and worked examples with four known deviations.
