# DevDigest: improvement plan

**Date:** 2026-09-27 · **Scope:** `server/`, `client/`, `reviewer-core/`, `e2e/`, tooling and CI
· **Base:** `main` @ `acd4c34`

This plan comes from a full-project review against the repo's skills:
`frontend-ui-architecture` (v1.0.0, branch `feat/frontend-ui-architecture-skill`),
`react-best-practices`, `next-best-practices`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `security`, and the rules in
`AGENTS.md`. It covers only the current starter code. Future-lesson features (L01–L08)
are **not** part of it.

## Baseline (everything is green today)

| Check | Result |
|---|---|
| typecheck: client · server · reviewer-core | ✅ · ✅ · ✅ |
| client tests (vitest + jsdom) | ✅ 54/54 (13 files) |
| server unit tests | ✅ 102/102 (16 files) |
| server integration (testcontainers) | ✅ 30/30 (6 files) |
| reviewer-core tests | ✅ 23/23 |

None of the problems below makes a test fail. They are gaps in what the tests cover.

## Priorities

- **P0: fix now.** A hang, data loss or a security hole reachable in normal use.
- **P1: reliability and architecture.** Breaks under load, on concurrent requests, or
  slows every change.
- **P2: code health.** Conventions, duplication, readability.
- **P3: tooling and docs.**

Effort: **S** ≤ 2 h · **M** ≈ half a day to a day · **L** > 1 day.

---

## P0: fix now

### P0-1 · The grounding gate can hang the whole API (reviewer-core) · S
- **Problem.** `rangeIntersects` walks every line from `start_line` to `end_line`
  (`reviewer-core/src/grounding.ts:41`). The line numbers come from the LLM, and the
  contract only checks `z.number().int()` (`contracts/findings.ts:53-54`).
  - Measured: a range of 10⁸ lines blocks for **0.65 s**. A single finding with
    `end_line: 9e15`, whether hallucinated or injected through the PR text, blocks the
    event loop of the whole server with no end in sight.
- **Fix.** Iterate over the set of hunk lines (its size is bounded by the diff) and
  check `lo ≤ n ≤ hi`. The semantics stay the same; only the complexity changes.
  - Add a test with `end_line = Number.MAX_SAFE_INTEGER`.
  - Optionally add `.min(1)` to the contract, but only after checking CI and old data.
- ⚠️ `groundFindings` is on the "Do not touch" list. The change **does not weaken** the
  gate, but it needs explicit approval and a separate PR.

### P0-2 · The API is open to the whole local network without authentication · S
- **Problem.** `server.ts:29` listens on `0.0.0.0` and there is no auth
  (`LocalNoAuthProvider`). Anyone on the same Wi-Fi can:
  - replace API keys (`POST /settings/test-connection`);
  - start paid LLM reviews;
  - post comments to GitHub with the user's token;
  - delete repos.

  CORS protects only browsers (security skill, A01/A02).
- **Fix.** Default to `HOST=127.0.0.1`, set through `config.ts`. Opening the port
  outward should be an explicit opt-in with a warning in the log.

### P0-3 · A 500 response sends the internal error text to the client · S
- **Problem.** `app.ts:162` sends `e.message` for any unknown error, which can include
  SQL messages, paths or library details (security A10, Fastify error-handling).
- **Fix.** For status ≥ 500, return the generic `'Internal error'` and log the details.
  Keep the 4xx behaviour as it is.

### P0-4 · An invalid key overwrites a working one · S
- **Problem.** `POST /settings/test-connection` saves the key *before* checking it
  (`settings/routes.ts:79`). If the check fails, the old working key is already gone.
  - In `LocalSecretsProvider.set`, `writeFile` is not atomic (`secrets/local.ts:48`),
    and `mode: 0o600` applies only when the file is created.
- **Fix.**
  - Test the new key on a temporary client and save it only on `ok`.
  - Write through a temp file + `rename`, then `chmod 0600` after the write.

---

## P1: reliability and architecture

### P1-1 · No transactions anywhere in the server · M
- **Problem.** `grep '.transaction('` finds nothing. Every "delete + insert" happens
  without a transaction:
  - `pr_files`/`pr_commits` in `GET /pulls/:id` (`pulls/routes.ts:237`);
  - `replaceEdges`, `replaceFileRank` and `replaceFileFacts`, plus symbol deletion, in
    repo-intel (`repo-intel/repository.ts:351+`).
  - Result: a concurrent reader (a review that reads the repo map during reindexing)
    sees empty data. A crash in the middle leaves a PR without files.
- **Fix.** Wrap each "replace" in `db.transaction(async (tx) => …)`, with repository
  methods taking `tx`. This follows the drizzle skill's advice to use transactions for
  multi-step operations.

### P1-2 · `GET /repos/:id/pulls` syncs with GitHub on every read · M
- **Problem.** On each call the list:
  - runs N sequential upserts;
  - makes up to 10 extra `getPullRequest` calls (`pulls/routes.ts:43-116`);
  - repeats the same upsert loop copied into `polling/routes.ts`.

  The client calls this endpoint **even from the PR detail page**, just to resolve
  `number → uuid` (`pulls/[number]/page.tsx:35`). That makes the PR page slow and
  uses up the GitHub rate limit. A GET with side effects also breaks HTTP semantics.
- **Fix.**
  - Split the module the way `modules/AGENTS.md` intends:
    `pulls/{routes,service,repository}.ts`.
  - Move the sync into `PullSyncService` behind `container.jobs` (the "Long work →
    container.jobs" rule). `POST /repos/:id/poll` and a background refresh call it.
  - GET only reads.
  - Add `GET /repos/:id/pulls/by-number/:number` so the detail page doesn't fetch the
    whole list.

### P1-3 · `RunBus` never frees memory · S
- **Problem.** `complete()` removes only the emitter (`platform/sse.ts:76`). The
  `buffers` (the full event log of every run), `seq` and `completed` maps grow forever.
  - `POST /runs/:id/cancel` and `GET /runs/:id/events` for an arbitrary uuid create
    new entries.
  - SSE for a nonexistent run hangs forever.
- **Fix.**
  - Clear the buffer after a TTL once `saveRunTrace` has run. The trace is already in
    the DB, so late subscribers can read `/runs/:id/trace`.
  - In `/events`, check that the run exists (and its workspace). For a finished run,
    return the buffer or trace and close the stream.

### P1-4 · A job timeout doesn't stop the job, and a retry starts a second copy · M
- **Problem.** `withTimeout` is just a `Promise.race` (`resilience.ts:20`). The handler
  keeps running after the timeout, and `JobRunner` (`jobs.ts:65`) immediately starts a
  retry.
  - Two clones or two indexing runs of one repo in the same directory at once is a
    race.
  - `jobs` rows stuck in `running` are not cleaned up on boot (only `agent_runs` are).
- **Fix.**
  - Pass an `AbortSignal` to the handler and the adapters (simple-git and Octokit
    support it).
  - Retry only after the previous attempt has actually stopped.
  - Reap `jobs.status='running'` on boot.

### P1-5 · Review runs bypass `JobRunner` · M
- **Problem.** `ReviewService.runReview` launches the work as fire-and-forget
  (`reviews/service.ts:134`):
  - no concurrency limit and no global timeout;
  - the only protection is a 10/min rate limit on the route.

  Ten clicks means ten parallel LLM runs.
- **Fix.** A separate `review` queue in `JobRunner` (concurrency 1–2, with a timeout)
  or a dedicated p-queue in the container. The SSE contract stays the same.

### P1-6 · Workspace scoping is incomplete (IDOR once auth arrives) · M
- **Problem.** The "Every DB query is scoped by workspaceId" rule is broken in several
  places:
  - `/runs/:id/cancel`, `/runs/:id/trace` and `/runs/:id/events` call `getContext` but
    ignore the result (`reviews/routes.ts:52,115,122`);
  - `cancelRunIfRunning`, `getRunTrace`, `reviewsForPull(prId)`, `getRepo(repoId)` and
    the `rows` in the PR list use no `workspaceId`;
  - repo-intel is scoped by `repoId` only.
  - `db/schema.ts` mentions a "base-repository guard" that doesn't exist.
- **Fix.**
  - Add `workspaceId` to every signature in `reviews/repository/*`.
  - Add an integration test: "a run from workspace B is not visible from A".
  - Remove or implement the guard mentioned in the schema comment.

### P1-7 · Missing indexes on hot paths · S
- **Problem.** Postgres doesn't index FKs automatically (postgresql skill):
  - `reviews.pr_id` has no index, yet the PR list and `reviewsForPull` filter on
    `pr_id, kind` sorted by `created_at`;
  - `pr_files.pr_id` and `pr_commits.pr_id` have none (delete and select per PR);
  - `agent_runs.agent_id` has none.
- **Fix.**
  - Add `reviews (workspace_id, pr_id, kind, created_at desc)`, plus FK indexes on
    `pr_files`, `pr_commits` and `agent_runs.agent_id`.
  - Only through `pnpm db:generate` + `pnpm db:migrate`, never by hand.

### P1-8 · The client has no error / not-found boundaries · S
- **Problem.** `src/app` has no `error.tsx`, `global-error.tsx` or `not-found.tsx`
  (next skill: error-handling). An uncaught render error shows the default Next page,
  and the whole client subtree unmounts.
- **Fix.** Add `app/error.tsx` (with a "Try again" button that calls `reset`), plus
  `global-error.tsx` and `not-found.tsx`, all with texts from `messages/en/common.json`.

---

## P2: code health

### Server

| # | What | Where | Fix | Effort |
|---|---|---|---|---|
| P2-1 | Routes have no `response` schemas: the contract is checked only by TS types, and extra fields (`{...detail, id}`) leak into responses | all `modules/*/routes.ts` | Add `schema.response` from `@devdigest/shared`, starting with `pulls`, `reviews`, `agents` (fastify skill: schema-first) | M |
| P2-2 | `RunRequest.parse(req.body)` by hand | `reviews/routes.ts:32` | `schema: { body: RunRequest.default({}) }`, per the module rule | S |
| P2-3 | Legacy "Drizzle in the handler" modules: `pulls` (379 lines), `polling`, `workspace`; `workspace` has no ZodTypeProvider | `modules/{pulls,polling,workspace}` | The routes → service → repository split (together with P1-2) | M |
| P2-4 | `getBlastRadius` is 178 lines; `repo-intel/service.ts` has 764 | `repo-intel/service.ts:220` | Move the pure parts into `pipeline/` or `helpers` with unit tests | M |
| P2-5 | N+1 in `reviewsForPull`: agent names are loaded one by one | `reviews/service.ts` | One `inArray` query or a join | S |
| P2-6 | `ReviewService` builds its own `ReviewRepository` in routes and in `app.ts` instead of using `container.reviewRepo` | `reviews/service.ts`, `app.ts` | Take it from the container | S |
| P2-7 | Status fields (`status`, `severity`, `category`, `agent_runs.status`) are free `text` with no CHECK | `db/schema/*` | `text({ enum })` + CHECK through a migration (postgresql skill) | M |
| P2-8 | `pnpm build` doesn't copy `src/prompts` into `dist/` (known) | `server/package.json` | Copy step in `build`, or load via `new URL(..., import.meta.url)` from `src` | S |

### Client (per `frontend-ui-architecture` + `react-best-practices`)

| # | What | Where | Fix | Effort |
|---|---|---|---|---|
| P2-9 | Import from another route's `_components/` | `pulls/_components/FindingsCell/FindingsCell.tsx:21-22` | Move `sortBySeverity` and `lineLabel` into `lib/findings.ts` | S |
| P2-10 | Fat pages: filtering, sorting and tab logic inside `page.tsx` | `pulls/page.tsx`, `pulls/[number]/page.tsx` (188 lines) | A `<Name>View` in `_components/` + `helpers.ts` with tests | M |
| P2-11 | A component builds query keys itself (`["pr-active-runs", prId]`) | `pulls/[number]/page.tsx:52,57` | An `invalidate…` helper or a key factory in `lib/hooks/reviews.ts` | S |
| P2-12 | `useEffect` for state sync (react.dev "You Might Not Need an Effect"): 9 `useState` + an effect reset on `agent.id`; `setFocusIdx(0)` in an effect; `holdsTarget → open` | `ConfigTab.tsx:29`, `FindingsPanel.tsx:44`, `ReviewRunAccordion.tsx:50` | `key={agent.id}` + `useReducer`; reset inside the filter handlers; derive `open` | S |
| P2-13 | Hard-coded English strings, against the i18n rule | `app/page.tsx`, `FindingsTab.tsx:109,154`, `AddRepoView.tsx:77`, `aria-label`s in `AgentCard`, `ReviewRunAccordion`, `CodeLine` | Move into `messages/en/*.json` | S |
| P2-14 | Deep relative imports `../../../../../lib/...` | `pulls/[number]/page.tsx`, `RunReviewDropdown.tsx`, `pulls/constants.ts` | `@/…` | S |
| P2-15 | Inline `style={{…}}` next to `styles.ts` (16 in `AddRepoView`, 14 in `RunHistory`, 13 in `agents/[id]/page.tsx`, 11 in `ReviewRunAccordion`) | see counts | Move into `styles.ts` (`s`) | S |
| P2-16 | Index used as `key` for `FileCard` with `open` state: when the diff refetches with a different file set, the expanded state jumps to another file (CodeLine's `key={i}` over the static lines of a hunk is fine) | `DiffViewer.tsx:28` | `key={f.path}` | S |
| P2-17 | Redirect from `/` via `useEffect` shows a flash of "Welcome" | `app/page.tsx:15` | Keep the client redirect but render only a skeleton until the data arrives; i18n (P2-13) | S |
| P2-18 | `apiFetch` doesn't forward React Query's `signal`, so leaving a page doesn't cancel requests | `lib/api.ts` | `queryFn: ({ signal }) => api.get(url, { signal })` | S |

### Cross-package

| # | What | Fix | Effort |
|---|---|---|---|
| P2-19 | The two `@devdigest/shared` copies have drifted (`adapters.ts`, `contracts/{trace,eval-ci,knowledge,productionize}.ts`) | Sync them once, and add a CI job with `diff -r` (excluding `AGENTS.md`/`CLAUDE.md`) that fails on drift | S |

---

## P3: tooling and docs

| # | What | Fix | Effort |
|---|---|---|---|
| P3-1 | The repo has no ESLint or formatter, yet the code carries `eslint-disable react-hooks/...`. So hooks rules are enforced by nobody | Flat ESLint config per package: `typescript-eslint`, `react-hooks`, `@next/eslint-plugin-next` (client), `eslint-plugin-boundaries` (the import rules from `frontend-ui-architecture`). Prettier with the current style (single quotes on the server, double on the client; check before enabling). Wire into CI | M |
| P3-2 | `npm audit` / `pnpm audit` doesn't run in CI (security A03) | A weekly `audit` job or Dependabot | S |
| P3-3 | Recharts warns `width(0)` in the smoke test | Fixed size for the chart container in the test setup | S |
| P3-4 | Docs drift: the "base-repository guard" (`db/schema.ts`) doesn't exist; `react-best-practices` → "Code Organization" contradicts the client | Fix the comment; after merging the skill, add a pointer in `react-best-practices` | S |
| P3-5 | e2e covers only two flows (boot → list → detail; agents) | Add "run review with a mocked LLM → findings → accept/dismiss" (needs an LLM stub on the server) | M |

---

## Suggested order (one branch = one commit = one PR)

1. `fix/grounding-range-scan` (P0-1, needs explicit approval, it's a protected zone)
2. `fix/api-bind-localhost` + `fix/error-handler-5xx` (P0-2, P0-3)
3. `fix/secrets-test-before-save` (P0-4)
4. `fix/runbus-memory` (P1-3)
5. `feat/db-indexes` (P1-7, migration via `db:generate`)
6. `refactor/pulls-module` (P1-2 + P2-3 + P1-1 for pulls)
7. `fix/repo-intel-transactions` (P1-1)
8. `fix/jobs-abort-and-reap` + `feat/review-queue` (P1-4, P1-5)
9. `fix/workspace-scoping` (P1-6)
10. `feat/client-error-boundaries` (P1-8)
11. Client cleanup (P2-9 … P2-18). Two or three PRs are enough, grouped by route.
12. `chore/eslint-prettier` (P3-1). Best done **before** step 11 so the linter catches
    regressions.
13. The rest of P2 and P3.

## What we deliberately don't touch

- The review logic and `INJECTION_GUARD`. P0-1 only changes how the grounding check
  runs, not what it decides.
- `server/src/db/migrations/**`: only `pnpm db:generate`.
- Moving the client to RSC. The client is an SPA over the Fastify API, the whole data
  layer runs on React Query, and SSE is client-only. Server Components would give
  little here and would clash with the architecture.
- Future-lesson features (L01–L08).
