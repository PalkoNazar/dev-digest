# modules/repo-intel

Codebase indexer: symbols, import graph, PageRank file rank, cached repo map.
Pipeline and facade are described in `README.md` — read it before changing anything.

## Rules
- Consumers read ONLY through the facade (`service.ts`, via `container.repoIntel`);
  never import `pipeline/*` from another module.
- The facade degrades (empty result / `degraded: true`) instead of throwing when a repo
  is unindexed or `REPO_INTEL_ENABLED=false`. Keep that contract.
- Indexing runs as jobs (`repo-intel-index` / `-refresh` / `-resync`), never inline.

## Gotchas
- Changing the AST extractor or symbol tables → bump `INDEXER_VERSION` in
  `constants.ts`, otherwise old indexes are never rebuilt.
- `getBlastRadius` is used by `modules/blast` (`GET /pulls/:id/blast`,
  `GET /repos/:id/pulls/:number/blast`). It reads the persistent index only — never re-parse
  the clone, never call the LLM. Callers are capped per symbol (`MAX_CALLERS_PER_SYMBOL`) and
  endpoints/crons are found through importers up to `BFS_DEPTH` hops (`constants.ts`). It
  degrades with a reason: `flag_off`, `no_data`, the persisted reason or `index_failed`
  (failed/degraded index, empty result), `index_partial` (partial index, data returned).
- `getUnresolvedReferences` and `getConventionSamples` exist but are unused in the starter —
  keep them.
- A comment in `../repos/service.ts` mentions `POST /repos/:id/reindex`; the real route
  is `POST /repos/:id/resync`.
