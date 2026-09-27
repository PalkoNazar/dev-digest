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
- Facade methods for later lessons (`getBlastRadius`, `getUnresolvedReferences`,
  `getConventionSamples`) exist but are unused in the starter — keep them.
- A comment in `../repos/service.ts` mentions `POST /repos/:id/reindex`; the real route
  is `POST /repos/:id/resync`.
