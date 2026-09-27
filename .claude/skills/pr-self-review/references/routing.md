# Routing: skill ↔ files

`scripts/collect-diff.mjs` parses **the table below** (rows whose first cell holds
backticked globs). Edit the table to change routing — no code change needed.

- **Globs** — comma-separated, backticked, matched against repo-relative paths
  (`*` = one segment, `**` = any depth, `{a,b}` = alternatives).
- **Skills** — backticked names of folders in `.claude/skills/`.
- **Group** — which reviewer subagent gets the file: `ui`, `backend` or `shared`.
- **Content** — optional backticked regex; the row applies only when an *added* line
  matches it. With `—`, the glob alone decides.

A file can match several rows; it gets the union of their skills and is reviewed by
every group that owns one of them.

| Globs | Skills | Group | Content |
|---|---|---|---|
| `client/src/**/*.ts`, `client/src/**/*.tsx` | `frontend-ui-architecture`, `react-best-practices` | ui | — |
| `client/src/app/**/*.ts`, `client/src/app/**/*.tsx` | `next-best-practices` | ui | — |
| `client/**/*.test.ts`, `client/**/*.test.tsx` | `react-testing-library` | ui | — |
| `server/src/**/*.ts`, `reviewer-core/src/**/*.ts` | `onion-architecture` | backend | — |
| `server/src/**/routes*.ts`, `server/src/**/plugins/**/*.ts`, `server/src/app.ts`, `server/src/server.ts` | `fastify-best-practices` | backend | — |
| `server/src/db/**/*.ts`, `server/src/**/*repository*.ts` | `drizzle-orm-patterns` | backend | — |
| `server/src/db/schema.ts`, `server/src/db/schema/**/*.ts` | `postgresql-table-design` | backend | — |
| `server/src/vendor/shared/**/*.ts`, `client/src/vendor/shared/**/*.ts` | `zod` | shared | — |
| `**/*.ts`, `**/*.tsx` | `zod` | shared | `z\.(object\|enum\|union\|discriminatedUnion)\(\|\.safeParse\(` |
| `**/*.ts`, `**/*.tsx`, `**/*.mjs`, `**/*.js`, `**/*.sh` | `security` | shared | — |
| `**/*.ts`, `**/*.tsx` | `typescript-expert` | shared | `\binfer\b\|extends .+ \? \|keyof \|as unknown as` |

## Never routed

Reviewer skills only. These are not review skills and are never run:
`mermaid-diagram`, `engineering-insights`, `pr-self-review`.

## Excluded from review

Lock files (`pnpm-lock.yaml`, `package-lock.json`), `dist/`, `.next/`, `build/`,
`coverage/`, binary files. `server/src/db/migrations/**` is not LLM-reviewed — the
hard check `migration-hand-edit` covers it.

## Unmapped skills

A skill folder in `.claude/skills/` that appears in no row above and not in "Never
routed" is reported as `unmapped-skill` (a warning). Add a row for it or list it under
"Never routed".
