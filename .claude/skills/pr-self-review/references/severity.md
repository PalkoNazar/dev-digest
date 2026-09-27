# Severity rubric

Only **critical** blocks the push. Everything else is reported and never blocks, so
assign critical only when the rule below clearly holds — a false critical costs a
bypass and teaches people to ignore the gate.

## critical — blocks the push

Exactly these, nothing else:

| Rule id | When |
|---|---|
| `layer-violation` | An import that breaks the layer rules: onion rings in `server/src` / `reviewer-core/src` (e.g. a service importing Drizzle or Fastify, a route calling the DB directly, a service taking the whole `Container`), or client import rules from `frontend-ui-architecture` (e.g. `vendor/ui` importing app code, a route importing another route's `_components`, a component calling `fetch` instead of `lib/hooks`). |
| `security-vuln` | An exploitable vulnerability in the changed code: injection (SQL, command, path), missing authz on a new route, SSRF, secrets written to logs/traces/DB, XSS via `dangerouslySetInnerHTML` with untrusted data. Not: "could be hardened", missing rate limit, style. |
| `do-not-touch` | A change that the root `CLAUDE.md` "Do not touch" section forbids: hand-edited migration, weakened `groundFindings` / `INJECTION_GUARD`, secret outside `~/.devdigest/secrets.json` / env. |
| `broken-contract` | A Zod contract in `@devdigest/shared` changed incompatibly while server or client code still uses the old shape, or the two copies of a changed contract now disagree. |
| `missing-workspace-scope` | A new or changed DB query that is not scoped by `workspaceId` from `getContext`. |
| `build-broken` | Deterministic only: `typecheck`, `test` or `arch:check` fails in a touched package (set by `hard-checks.mjs`, never by a reviewer). |
| `secret-leak` | Deterministic only: a credential in an added line or a committed `.env` / `secrets.json` (set by `hard-checks.mjs`). |

## major — reported, does not block

A real defect or rule break that is not in the list above: a bug with a clear failure
scenario, a skill rule broken in a way that will hurt (wrong folder for a component,
logic in `page.tsx`, React anti-pattern that causes stale state or extra renders), one
copy of `@devdigest/shared` edited without the other, reviewer prompts out of sync, a new
service/route without tests.

## minor — reported, does not block

A skill convention not followed where the impact is small: naming, a helper that should
live in `helpers.ts`, a missing `aria-label`, a constant inline instead of `constants.ts`.

## nit — reported, does not block

Taste. Reviewers should report at most 3 nits per group; prefer silence.

## Rules for reviewers

- Report only what is on **added or changed lines** of the diff. Pre-existing problems
  in untouched lines are out of scope, even if the skill forbids them.
- Every finding needs `evidence`: a verbatim substring of the changed line (≥ 8 chars),
  so the grounding step can check it. No evidence → dropped.
- `rule` is a rule id from the table above for critical; for other severities use a
  short kebab-case id naming the skill rule (e.g. `component-folder`, `effect-for-derived-state`).
- When unsure between two severities, pick the lower one.
