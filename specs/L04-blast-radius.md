# Blast Radius
Status: draft · Lesson: L04 (homework) · Packages: server, client, mcp
Plan: `specs/plans/2026-10-10-blast-radius.plan.md`

## Goal
A reviewer sees what else a PR can break: symbols declared in changed files, who calls them
(file:line), and which HTTP endpoints / crons may depend on the change — on the PR Overview tab
and through the devdigest-mcp tool `get_blast_radius`. Reads the repo-intel index built at
clone/resync time; no re-analysis, no LLM.

## Scope
- In: `GET /pulls/:id/blast` (UI) and `GET /repos/:id/pulls/:number/blast` (MCP, side-effect
  free) — both `BlastRadius` + degraded/reason/stats/index_sha; repo-intel facade reads only the
  persistent index (per-symbol caller cap, BFS_DEPTH hop for endpoints/crons, honest degraded
  reasons); Overview "Blast radius" block (stats, collapsible per-symbol tree, GitHub blob links,
  endpoint + cron chips, empty + degraded states, Resync); MCP `get_blast_radius`
  (repo "owner/name" + pr → compact map, ≤ 4,000 chars, `readOnlyHint: true`).
- Out: graph view / Tree-Graph toggle, prior PRs touching these files, caching, PR Brief.

## Design
- Contract: `@devdigest/shared` `BlastRadius` (both copies) + optional `degraded`,
  `reason` (flag_off | index_failed | index_partial | repo_too_large | no_data), `stats`
  {symbols, callers, endpoints, crons}, `index_sha`.
- Server: `modules/blast` (routes → BlastService → BlastRepo [pull + pr_files, workspace-scoped]
  + BlastSource = `container.repoIntel.getBlastRadius`, called once). Mapping is a pure helper.
- Limits: `MAX_CALLERS_PER_SYMBOL`, `BFS_DEPTH` in `server/src/modules/repo-intel/constants.ts`.
- Callers are resolved through import edges (`references.decl_file`); same-file uses and
  barrel re-exports are not callers. Line numbers are 1-based at `index_sha`.
- Client: `usePrBlast` (`lib/hooks/blast.ts`), `OverviewTab/_components/BlastRadiusCard`,
  strings in `messages/en/blast.json`.
- MCP: port `getBlastRadius(repoId, number)`, HTTP adapter → `GET /repos/:id/pulls/:number/blast`;
  PR resolution never calls the upserting `GET /repos/:id/pulls`, so the tool is read-only.

## Acceptance criteria
- [ ] Overview block with counts; per-symbol callers file:line + endpoints/crons under them.
- [ ] A PR changing `server/src/modules/reviews/helpers.ts` shows ≥ 2 callers and ≥ 1 endpoint.
- [ ] file:line opens the GitHub blob at that line.
- [ ] Empty state; degraded badge with reason; Resync.
- [ ] Route response validated by `BlastRadius`; unit test for the mapping; no LLM; the log
      line says the index was read (no re-parse).
- [ ] MCP `get_blast_radius` returns the same map; unknown PR → actionable `isError`;
      `readOnlyHint: true`.
