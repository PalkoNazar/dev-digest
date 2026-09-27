# client/src/components

Cross-page app components (not the design system — that is `src/vendor/ui`).

- `app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `diff-viewer/` — GitHub-like diff + inline comment threads (the heaviest UI piece)
- `run-cost-badge/` — `RunCostBadge` (compact `$0.014` / full `9,119 tok · $0.0013`) +
  `formatUsd` (unknown → `—`, never `$0.00`); used by PR list, run timeline, trace drawer
- `mermaid-diagram/` — lazy client-only mermaid; validates with `mermaid.parse`
  before render (otherwise mermaid injects a "Syntax error" graphic)
- `showcase/` — renders every UI component for visual checks (dev-only, no i18n)

## Rules
- Generic, feature-agnostic primitives go to `src/vendor/ui`, not here.
- Same folder convention as routes: `Name/{Name.tsx, index.ts, styles.ts, …}`.
