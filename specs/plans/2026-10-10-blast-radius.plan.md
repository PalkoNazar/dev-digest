# Plan: Blast Radius (L04 homework) — Overview block + MCP `get_blast_radius`
Status: ready · Date: 2026-10-10 · Branch: feat/l04-blast-radius · Packages: server, client, mcp
Spec: `specs/L04-blast-radius.md`

Decision (user, 2026-10-10): Open question 1 → **C**. Add a side-effect-free PR lookup on the
server (`GET /repos/:id/pulls/:number/blast`) so the MCP tool never calls the upserting
`GET /repos/:id/pulls` and can honestly be `readOnlyHint: true`.

## Goal
On the PR page **Overview** tab a reviewer sees a **Blast radius** block built from the
already-existing repo-intel index: a summary row (changed symbols / callers / endpoints / crons),
then per changed symbol (with callers) a collapsible tree — callers as `file:line` links to the
GitHub blob at that line, endpoint chips and (separate) cron chips; a clear empty state ("no
downstream callers") and a distinct degraded badge with its reason + Resync button. The same map is
served by `GET /pulls/:id/blast` (UI) and `GET /repos/:id/pulls/:number/blast` (MCP), both
validated against the `BlastRadius` contract and built by the same service, and returned to Claude
Code by devdigest-mcp `get_blast_radius` (stub replaced). No LLM, no re-parse: the route only
reads `symbols`/`references`/`file_rank`/`file_edges`/`file_facts`.

## Context read (key facts)
- `CLAUDE.md`: contract first in both `vendor/shared` copies; adapters via DI container;
  `workspaceId` scoping; migrations never hand-edited (this plan needs **no schema change**).
- `server/src/modules/AGENTS.md`: routes → service (`…Deps` from `ports.ts`) → repository; register
  with one import + one entry in `modules/index.ts`; don't copy the legacy routes-only `pulls` shape.
- `server/src/modules/repo-intel/AGENTS.md`: consumers read only via `container.repoIntel`; facade
  degrades, never throws; `getBlastRadius` is unused in the starter (only `repo-intel/` references it).
- `server/src/modules/repo-intel/service.ts:220-392` (verified):
  - flag off / no usable index → ripgrep **re-parse** fallback (`codeIndex.symbols`, `readClone` +
    `extractEndpoints`), always `reason: 'no_data'`;
  - `tryPersistentBlast` returns `degraded: false` even for a `partial` index;
  - `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` (~line 386) caps ALL callers, not per symbol;
  - `BFS_DEPTH` unused here → endpoints only from direct caller files.
- `repo-intel/repository.ts:386-424`: `decl_file` resolves via import edges; a file never imports
  itself → declaring file already excluded on the persistent path. `getResolvedCallers` inner-joins
  `file_rank`.
- `adapters/astgrep/index.ts:84`: reference lines are 1-based (`start.line + 1`) = GitHub `#L{n}`.
- `adapters/codeindex/extract.ts:182-214`: `file_facts` stores `endpoints` ("METHOD /path") and
  `crons` separately.
- `vendor/shared/contracts/brief.ts`: `BlastRadius { changed_symbols, downstream[{symbol,
  callers[{name,file,line}], endpoints_affected, crons_affected}], summary }`; no
  degraded/reason/stats/sha; server and client copies identical; `PrBrief` composes it (unused).
- Sibling pattern: `reviews/routes.ts:186-193` + `service.ts:186-203` (`/pulls/:id/smart-diff`).
- Unit-test pattern for the facade without DB: `server/test/repo-intel-facade-degraded.test.ts`.
- Client: page `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` has `repoId`, `prId`,
  `repoFullName`, `pr.head_sha`, renders `<OverviewTab prId prBody />` (line ~139); IntentCard is the
  sibling block pattern; `lib/hooks/repo-intel.ts` has `useRepoIntelStatus` + `useResyncRepoIntel`;
  `lib/github-urls.ts` has `githubBlobUrl`; `messages/en/blast.json` has `stat.*`, `view.*`,
  `callerCount`, `noDownstream`, `graph.*`.
- MCP: rings core / api / mcp; shared from the **server** copy; description ≤ 300 chars,
  `tools/list` ≤ 6,000; results < ~2k tokens; one-line `isError`; `resolvePull` goes through
  `GET /repos/:id/pulls` which **upserts** (why `get_findings` is `readOnlyHint: false`);
  `GET /repos` is a plain workspace-scoped list. Stub test `mcp/test/tools.test.ts:116-125`.

## Constraints
- Contract first, both shared copies byte-identical; new fields `.optional()`/`.nullish()`.
  mcp and reviewer-core compile against the server copy → R1 also runs `cd mcp && pnpm typecheck`.
- Onion: `blast` must not import `repo-intel/*` (not even types; `no-cross-module-internals`).
  Its `ports.ts` declares a structural `BlastSource`; `container.repoIntel` satisfies it. Drizzle
  only in `blast/repository.ts`; `Container` only in `blast/routes.ts`.
- Every query scoped by `workspaceId` (`pull_requests.workspace_id`; `pr_files` joined to
  `pull_requests`). The facade is keyed by `repoId`, so only a repo id from a scoped pull row reaches it.
- Thin routes: `getContext` → one service call → return; Zod `params`; `response: { 200: BlastRadius }`.
- No LLM, GitHub, git or fs on the request path; facade never takes a re-parse path; never throws.
- Limits only from `repo-intel/constants.ts` (`MAX_CALLERS_PER_SYMBOL`, `BFS_DEPTH`); none in client
  components or the blast module.
- Logs: one structured info line per request with counts/status only, never file contents.
- Client: next-intl `blast` namespace; UI only from `@devdigest/ui` barrel; data only via
  `lib/hooks/blast.ts` re-exported from `lib/hooks/index.ts`.
- MCP: flat input `{ repo, pr }`; no `outputSchema`; description ≤ 300 chars, purpose first; one
  minified-JSON text block with a size budget; `isError` with a next step; core does not import the SDK.
- Don't touch migrations, `groundFindings`, `INJECTION_GUARD`.
- Server tests flat in `server/test/` (`*.it.test.ts` if using `test/helpers/pg.ts`); client tests
  colocated, `vi.mock` hooks + `fireEvent`, vitest imports explicit.
- No formatter: single quotes ~100 cols on server/mcp, double quotes on client.

## Affected modules
| Package | File | Action |
|---|---|---|
| shared | `server/src/vendor/shared/contracts/brief.ts` + `client/src/vendor/shared/contracts/brief.ts` | edit (identical) |
| server | `server/src/modules/repo-intel/{types,repository,service}.ts` | edit |
| server | `server/src/modules/repo-intel/helpers.ts` | new (pure) |
| server | `server/src/modules/blast/{ports,helpers,repository,service,routes}.ts` | new |
| server | `server/src/modules/index.ts` | edit (register `blast`) |
| server | `server/test/{repo-intel-blast,blast-helpers,blast-service}.test.ts`, `server/test/blast.it.test.ts` | new |
| server | `server/test/routes-smoke.test.ts`, `server/test/contracts.test.ts` | edit |
| client | `client/src/lib/hooks/blast.ts`, `blast.test.tsx` | new |
| client | `client/src/lib/hooks/index.ts`, `client/messages/en/blast.json` | edit |
| client | `.../pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/*` | new |
| client | `.../pulls/[number]/_components/OverviewTab/_components/BlastSymbolImpact/*` | new |
| client | `.../OverviewTab/OverviewTab.tsx`, `.../pulls/[number]/page.tsx` (props only) | edit |
| mcp | `mcp/src/core/{views,port,format,constants}.ts`, `mcp/src/api/http.ts` | edit |
| mcp | `mcp/src/core/get-blast-radius.ts` | new |
| mcp | `mcp/src/mcp/tools/get-blast-radius.ts`, `mcp/src/mcp/server.ts` | edit |
| mcp | `mcp/test/helpers/{fake-api,fixtures}.ts`, `mcp/test/{tools,surface,http-api,format,core-read}.test.ts` | edit |
| docs | `specs/L04-blast-radius.md`, `specs/L04-mcp-server.md`, `mcp/AGENTS.md`, `server/src/modules/repo-intel/AGENTS.md`, `client/src/app/AGENTS.md`, `server/README.md` | edit |

## Steps

### S1 — Contract: extend `BlastRadius` (both shared copies)
- Package: shared · Depends on: —
- Change: add `BlastDegradedReason = z.enum(['flag_off','index_failed','index_partial',
  'repo_too_large','no_data'])`; `BlastStats = z.object({ symbols, callers, endpoints, crons })`
  (non-negative ints); extend `BlastRadius` with `degraded: z.boolean().optional()`,
  `reason: BlastDegradedReason.optional()`, `stats: BlastStats.optional()`,
  `index_sha: z.string().nullish()`. Export schemas + inferred types. Others unchanged.
- Skills: zod; security, typescript-expert
- Tests: `server/test/contracts.test.ts` — full payload parses; legacy payload (no new fields)
  parses; unknown `reason` fails.
- Done when: `diff` of both copies empty; server, client, mcp typecheck.

### S2 — Facade: read-only, honest degraded reasons, per-symbol cap, `BFS_DEPTH` attribution
- Package: server · Depends on: —
- Files: `repo-intel/types.ts`, `repo-intel/helpers.ts` (new, pure), `repo-intel/repository.ts`,
  `repo-intel/service.ts`
- Change:
  - `types.ts`: `BlastResult.indexedSha?: string` (doc comment).
  - `repository.ts`: `getImporters(repoId, files)` → `{ fromFile, toFile }[]` from `file_edges`
    where `repo_id = repoId AND to_file IN files` (uses `file_edges_repo_to_idx`); `[]` for empty input.
  - `helpers.ts`: `capCallersPerSymbol(callers, max)` (keeps rank-desc order, caps per `viaSymbol`);
    `attributeFacts(callerFiles, importerEdgesByHop, factRows)` → `Record<callerFile, { endpoints;
    crons }>` = deduped union of the caller file's facts and those of its transitive importers
    within the extra hops.
  - `service.ts` `getBlastRadius` — replace gating, remove the ripgrep branch:
    1. no changed files → empty, `degraded: false`;
    2. `!config.repoIntelEnabled` → empty, `degraded: true, reason: 'flag_off'`;
    3. no index state → `no_data`;
    4. status `failed`/`degraded` → `reason: state.degradedReason ?? 'index_failed'` (only if it is
       a valid `DegradedReason`, else `index_failed`);
    5. `partial` → persistent data + `degraded: true, reason: 'index_partial'`;
    6. `full` → persistent data, `degraded: false`;
    7. set `indexedSha: state.lastIndexedSha` whenever a state exists;
    8. delete `enclosingSymbolName` / `readClone` / `extractEndpoints` / fs imports only if grep
       shows no other use.
  - `tryPersistentBlast(repoId, files, state)`: state read once; `capCallersPerSymbol(callers,
    MAX_CALLERS_PER_SYMBOL)`; BFS: hop 1 = caller files, `BFS_DEPTH - 1` further hops via
    `getImporters` on the frontier (skip seen), then one `getFileFacts` over callers ∪ importers;
    `factsByFile = attributeFacts(…)`; `impactedEndpoints` = union.
  - Doc comment: "reads the persistent index only; never re-parses".
- Skills: onion-architecture; drizzle-orm-patterns (`repository.ts`); security, typescript-expert
- Tests: `server/test/repo-intel-blast.test.ts` (fake `svc.repo`; `codeIndex` stub throws if
  called): flag off → `flag_off`, no repo/codeIndex call; no state → `no_data`; failed →
  `index_failed`; partial → data + `index_partial`; full → `degraded: false` + `indexedSha`;
  25 callers of A + 3 of B → 20 + 3; hop-2 importer's `GET /x` attributed to the caller; crons not in
  endpoints; helper cases (dedupe, edge cycle, empty). `repo-intel-facade-degraded.test.ts` stays green.
- Done when: tests pass; `pnpm arch:check` green.

### S3 — Blast mapper (pure): facade shape → `BlastRadius`
- Package: server · Depends on: S1
- Files: `blast/ports.ts` (new, types), `blast/helpers.ts` (new)
- Change:
  - `ports.ts`: `BlastSourceResult` (structural copy of `BlastResult`), `BlastSource {
    getBlastRadius(repoId, changedFiles) }`, `BlastRepo` (S4), `BlastLogger = { info(obj: object,
    msg: string): void }`, `BlastDeps { repo; source }`.
  - `helpers.ts` `toBlastRadius(r)`: `changed_symbols` = `{name,file,kind}`; group callers by
    `viaSymbol` keeping rank-desc order; defensive drop of a caller whose `file` is a declaring file
    of the same-named changed symbol; callers = `{ name: c.symbol, file, line }`;
    `endpoints_affected`/`crons_affected` = sorted deduped union of `factsByFile[callerFile]` over the
    group (`[]` without `factsByFile`); sort `downstream` by max caller rank desc, then callers desc,
    then symbol asc; `stats` (symbols = changed_symbols.length, callers = sum, endpoints/crons =
    distinct across groups); `summary = blastSummary(stats, degraded, reason)`; pass `degraded`
    (default false), `reason`, `index_sha = indexedSha ?? null`.
  - `blastSummary`: deterministic English, e.g. "3 changed symbols · 7 callers · 2 endpoints ·
    1 cron"; degraded → prefix like "Index partial — ".
- Skills: onion-architecture; typescript-expert, security
- Tests: `server/test/blast-helpers.test.ts` — flat → grouped; per-group endpoints/crons separate;
  declaring-file caller dropped; rank order; stats; no callers → `downstream: []`; degraded
  passthrough + summary prefix; `BlastRadius.parse(toBlastRadius(x))` succeeds.

### S4 — Blast repository + service
- Package: server · Depends on: S3
- Files: `blast/repository.ts` (new), `blast/service.ts` (new), `blast/ports.ts` (edit)
- Change:
  - `BlastRepo`: `findPull(workspaceId, prId)` and **`findPullByNumber(workspaceId, repoId, number)`**
    → `{ id, repoId } | null` (`pull_requests` filtered by `workspace_id` [+ `repo_id`, `number`]);
    `listChangedFiles(workspaceId, prId)` → distinct `pr_files.path` inner-joined to
    `pull_requests` on workspace + id. Plain shapes, not rows. Pure reads — no upsert, no GitHub.
  - `BlastService.forPull(workspaceId, prId, log?)` and **`forPullNumber(workspaceId, repoId,
    number, log?)`** (both resolve the pull, then share one private `build(pull, log)`):
    missing pull → `NotFoundError('Pull request not found')` (number variant: message names the PR
    number and says to import/sync it in the UI); files = `listChangedFiles`; one
    `source.getBlastRadius(pull.repoId, files)`; one log line `{ prId, repoId, changedFiles,
    source: 'repo-intel-index', degraded, reason, symbols, callers, endpoints, crons, ms }`,
    msg `'blast: read repo-intel index (no re-parse, no LLM)'`; return `toBlastRadius(r)`.
- Skills: onion-architecture; drizzle-orm-patterns; security, typescript-expert
- Tests: `server/test/blast-service.test.ts` (hand-written fakes): unknown PR (both variants) →
  `NotFoundError`, source not called; source gets the PR's `repoId` + files, called once; log has
  `source: 'repo-intel-index'` + counts; degraded/reason flow through.

### S5 — Routes + registration
- Package: server · Depends on: S2, S4
- Files: `blast/routes.ts` (new), `modules/index.ts` (edit)
- Change: plugin builds `new BlastService({ repo: new BlastRepository(container.db), source:
  container.repoIntel })`;
  - `GET /pulls/:id/blast` — `params: IdParams`, `response: { 200: BlastRadius }` → `forPull`;
  - **`GET /repos/:id/pulls/:number/blast`** — params `{ id: uuid, number: z.coerce.number().int()
    .positive() }`, same response schema → `forPullNumber`. Side-effect free (used by MCP).
  - Header comment: routes, "no LLM, no re-parse, no writes".
- Skills: onion-architecture, fastify-best-practices; security, typescript-expert
- Tests: `server/test/blast.it.test.ts` (Docker; `startPg` + `seed`; `buildApp` with overrides
  `repoIntel: fake`, `MockSecretsProvider`, `MockGitHubClient`): 200 + body parses, fake got seeded
  paths (both routes); unknown uuid / unknown number → 404; PR in **another workspace** → 404, fake
  not called; `index_partial` passthrough; number route does not change `pull_requests` row count.
  `routes-smoke.test.ts`: `GET /pulls/not-a-uuid/blast` → 422; `GET /repos/<uuid>/pulls/abc/blast` → 422.
- Done when: unit + `blast.it.test` green; `pnpm arch:check` no new violations.

### S6 — Client hook `usePrBlast`
- Package: client · Depends on: S1
- Files: `client/src/lib/hooks/blast.ts` (new), `lib/hooks/index.ts` (edit), `blast.test.tsx` (new)
- Change: `BLAST_QUERY_ROOT = ["pr-blast"] as const`; `usePrBlast(prId)` → `useQuery({ queryKey:
  [...BLAST_QUERY_ROOT, prId], queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
  enabled: !!prId })`.
- Skills: frontend-ui-architecture, react-best-practices; react-testing-library; security, typescript-expert
- Tests: disabled when `prId` null; GETs `/pulls/<id>/blast`.

### S7 — i18n keys
- Package: client · Depends on: —
- File: `client/messages/en/blast.json` — add `title`, `loadError`, `section.{callers,endpoints,crons}`,
  `degraded.badge` ("Index incomplete"), `degraded.reason.{flag_off,index_failed,index_partial,
  repo_too_large,no_data}` (one line + next step), `resync`, `resyncing`, `expand`, `collapse`,
  `noChangedSymbols`, `openOnGithub`. Keep existing keys.

### S8 — `BlastRadiusCard` + `BlastSymbolImpact`
- Package: client · Depends on: S6, S7
- Files: `.../OverviewTab/_components/BlastRadiusCard/{BlastRadiusCard.tsx,index.ts,helpers.ts,
  helpers.test.ts,styles.ts,BlastRadiusCard.test.tsx}`, `.../OverviewTab/_components/
  BlastSymbolImpact/{BlastSymbolImpact.tsx,index.ts,styles.ts}` (new)
- Change:
  - `BlastRadiusCard({ prId, repoId, repoFullName, headSha })`: `useTranslations("blast")`,
    `usePrBlast(prId)`. States: Skeleton; `ErrorState` with retry; `data.degraded` → warn `Badge`
    `degraded.badge` + `degraded.reason.<reason>` + Resync `Button` (`useResyncRepoIntel(repoId)`),
    shown alongside any returned data; stats row from `data.stats` (`stat.*`); no downstream and not
    degraded → `EmptyState` `noDownstream`; else one `BlastSymbolImpact` per downstream item in
    server order.
  - Resync completion: remember `updatedAt` of `useRepoIntelStatus(repoId)` on click, poll; when
    `resyncFinished(startedAt, state)` → stop polling, `refetch()` blast.
  - `BlastSymbolImpact({ impact, linkSha, repoFullName, defaultOpen })`: own `open` state (first item
    open); header = symbol (mono) + `callerCount`; body = callers as links `file:line` + caller name,
    then endpoint badges under `section.endpoints` and cron badges under `section.crons`.
  - `helpers.ts`: `callerHref(repoFullName, sha, caller)` → `githubBlobUrl(...)` or `null` (plain
    text); `linkSha(blast, headSha)` = `blast.index_sha || headSha`; `resyncFinished(...)`.
  - No numeric limits; colours via CSS vars.
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices; react-testing-library;
  security, typescript-expert
- Tests: card — stats rendered; caller `href` = `https://github.com/acme/shop/blob/<index_sha>/src/a.ts#L12`;
  endpoint and cron chips in separate sections; header click collapses/expands; empty state;
  degraded badge + reason + Resync calls mutate; error retry calls refetch. helpers — `callerHref`
  with/without repo, `linkSha` fallback, `resyncFinished`.

### S9 — Wire into Overview
- Package: client · Depends on: S8
- Change: `OverviewTabProps` + `repoId`, `repoFullName: string | null`, `headSha: string | null`;
  render `{prId && <BlastRadiusCard … />}` after `IntentCard`, before the description; page passes
  the three props only.
- Done when: client typecheck + tests green; page loads in `next dev`.

### S10 — MCP port + HTTP adapter + view
- Package: mcp · Depends on: S1, S5
- Files: `mcp/src/core/{views,port}.ts`, `mcp/src/api/http.ts`, `mcp/test/helpers/{fake-api,
  fixtures}.ts`, `mcp/test/http-api.test.ts`
- Change: `BlastView = BlastRadius` (+ type); port `getBlastRadius(repoId: string, number: number):
  Promise<BlastView>`; http `request('GET', `/repos/${id(repoId)}/pulls/${number}/blast`,
  'GET /repos/:id/pulls/:number/blast', BlastView)`; FakeApi `blast?: Record<string, BlastView>`
  keyed by `${repoId}#${number}` + recorded call; fixture `blastDto(overrides)`.
- Tests: GET hits the path and parses; 404 envelope → `ApiHttpError`.

### S11 — MCP use case + compact renderer
- Package: mcp · Depends on: S10
- Files: `mcp/src/core/get-blast-radius.ts` (new), `mcp/src/core/{format,constants}.ts`,
  `mcp/test/{format,core-read}.test.ts`
- Change: `getBlastRadius({ api: Pick<DevDigestApi,'listRepos'|'getBlastRadius'> }, { repo, pr })`:
  `resolveRepo` → `api.getBlastRadius(repo.id, pr)`; a 404 → `ToolError("PR #N not found in
  owner/name — import/sync it in the DevDigest UI")` → `blastView(b)`. **No `listPulls` call.**
  `blastView` → `{ summary, stats, degraded?, reason?, hint?, symbols: [{ symbol, callers:
  ["file:line name"], endpoints, crons }] }`; degraded → `hint` "index incomplete: resync the repo in
  the DevDigest UI"; cut to `BLAST_RESULT_BUDGET_CHARS = 4_000` (overflow → `more: N` + hint; at
  least one symbol kept).
- Tests: format — 30 symbols × 20 callers ≤ 4,000 chars with `more`; degraded carries reason + hint.
  core — resolution order (`listRepos` then `getBlastRadius`, never `listPulls`); unknown PR →
  ToolError text.

### S12 — MCP tool registration (replace the stub)
- Package: mcp · Depends on: S11
- Files: `mcp/src/mcp/tools/get-blast-radius.ts`, `mcp/src/mcp/server.ts`, `mcp/test/{tools,surface}.test.ts`
- Change: input `{ repo: repoArg, pr: prArg }` unchanged; description ≤ 300 chars, e.g. "Get a PR's
  blast radius from DevDigest's code index: symbols declared in changed files, their callers
  (file:line) and HTTP endpoints/crons that may break. Call before reviewing or changing shared code.
  No LLM; reads the existing index."; handler `ok(await getBlastRadius(deps, args))`, catch →
  `fail(toToolMessage(err, deps.apiUrl))`; annotations `{ readOnlyHint: true, openWorldHint: false }`
  with a comment: read-only because it uses the side-effect-free number route, not `listPulls`.
- Tests: tools — success JSON with `symbols`/`stats`, calls = `listRepos`, `getBlastRadius`;
  unknown PR → `isError` with import hint; API unreachable → standard message. surface — five tools,
  budgets green, `get_blast_radius` in `READ_TOOLS`.
- Done when: `cd mcp && pnpm typecheck && pnpm test` green (incl. architecture + stdio tests).

### S13 — Docs (doc-writer)
- `specs/L04-blast-radius.md` status → done; `specs/L04-mcp-server.md` stub section → pointer;
  `mcp/AGENTS.md` stub rule replaced; `repo-intel/AGENTS.md` "unused" gotcha → used by `modules/blast`,
  never re-parses; `client/src/app/AGENTS.md` PR page map mentions the blast block; `server/README.md`
  API map gets both routes.

## Runs
| Run | Steps | Ends green on |
|---|---|---|
| R1 | S1–S5 | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm arch:check && pnpm exec vitest run blast.it.test` · `cd client && pnpm typecheck` · `cd mcp && pnpm typecheck` |
| R2 | S6–S9 | `cd client && pnpm typecheck && pnpm test` |
| R3 | S10–S12 | `cd mcp && pnpm typecheck && pnpm test` |
| R4 | S13 | doc review |

## Verification
- server: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm arch:check`; Docker: `pnpm exec vitest run blast.it.test`
- client: `cd client && pnpm typecheck && pnpm test`
- mcp: `cd mcp && pnpm typecheck && pnpm test`
- Dev DB (read-only): `curl -s localhost:3001/repos`; `curl -s localhost:3001/repos/<repoId>/index-state`
  (needs `status: "full"`); PR touching a shared helper via psql on `pull_requests`/`pr_files`
  (do NOT use `GET /repos/:id/pulls` as a read — it upserts). If none exists, the user pushes a demo
  PR editing `server/src/modules/reviews/helpers.ts`.
- Video script: Overview → stats row → expand symbol (≥ 2 callers, ≥ 1 endpoint chip) → open caller
  files → click `file:line` (GitHub at that line) → server log line → degraded (`REPO_INTEL_ENABLED=false`
  or partial) + Resync → empty state (PR changing only `*.md`) → Claude Code `get_blast_radius` →
  same map; unknown PR → one-line `isError`.

## Acceptance criteria
- [ ] P1 block on Overview with summary counts — S8/S9
- [ ] P1 per-symbol callers `file:line` + endpoints — S3/S8
- [ ] P1 shared-helper PR shows ≥ 2 callers and ≥ 1 endpoint — S2 (hop 2) + manual
- [ ] P1 `file:line` opens that line on GitHub — S8
- [ ] P1 empty + degraded states with reason — S2/S8
- [ ] P1 MCP returns the same map — S4 (shared `build`) + S10–S12
- [ ] P2 logs show index read, no re-parse — S2 throwing-codeIndex test + S4 log
- [ ] P2 route response validated by contract — S5
- [ ] P2 unit test for flat → grouped — S3
- [ ] P2 no LLM — S4 deps
- [ ] P2 declaring file not in own callers — S2 by construction + S3 test
- [ ] P2 limits from `constants.ts` — S2
- [ ] P2 degraded + reason reach UI — S1/S3/S5/S8
- [ ] P2 MCP tool per lab rules incl. honest `readOnlyHint: true` — S12
- [ ] P3 collapsible tree, crons separate, rank sort, Resync, labels from `blast.json` — S2/S3/S7/S8

## Risks
- Changed files come from `pr_files`; if missing, blast is empty (logged `changedFiles: 0`).
- Index is of the default branch at `lastIndexedSha`: PR-added symbols have no callers; links use
  `index_sha`, not `head_sha`.
- Callers resolve only via direct imports (barrels/ambiguous names → not shown).
- Grouping by `viaSymbol` merges same-named symbols from different files.
- Hop-2 fan-out on widely imported caller files (one indexed query per hop; cap later if slow).
- Removing the ripgrep fallback changes facade behaviour for unindexed repos (only consumer is `blast`).
- `pnpm arch:check` may show the 5 legacy edges in a fresh worktree — compare to baseline, never `arch:baseline`.

## Out of scope
Graph view / Tree-Graph toggle; Prior PRs; caching; PR Brief; per-symbol truncation flag; wider
caller resolution; workspace-scoping `index-state`/`resync`.

## INSIGHTS discrepancies (record after R1 if confirmed)
- Task brief vs code: `MAX_CALLERS_PER_SYMBOL` was a global cap; `BFS_DEPTH` unused by blast;
  facade only emitted `no_data` and reported `partial` as not degraded; declaring-file exclusion is
  implicit (import-edge resolution) on the persistent path.
