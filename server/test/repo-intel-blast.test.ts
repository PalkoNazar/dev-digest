import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import {
  attributeFacts,
  capCallersPerSymbol,
  isTestPath,
  toDegradedReason,
} from '../src/modules/repo-intel/helpers.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type {
  FullSymbolRow,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  ResolvedCallerRow,
} from '../src/modules/repo-intel/repository.js';
import type { IndexState, IndexStatus } from '../src/modules/repo-intel/types.js';

/**
 * L04 blast radius — facade `getBlastRadius` reads the persistent index only.
 * No Postgres: the service's repository is replaced with a fake; `codeIndex`
 * throws if touched, proving the ripgrep re-parse path is gone.
 */

interface FakeIndex {
  state?: IndexState | null;
  symbols?: FullSymbolRow[];
  callers?: ResolvedCallerRow[];
  edges?: IndexerEdgeRow[];
  facts?: IndexerFileFactsRow[];
}

function state(status: IndexStatus, extra: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status,
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 5,
    lastIndexedSha: 'sha-1',
    indexerVersion: 2,
    updatedAt: new Date(0),
    ...extra,
  };
}

function sym(path: string, name: string, line = 1): FullSymbolRow {
  return { path, name, kind: 'function', line, endLine: line + 5, exported: true, signature: null };
}

function build(opts: { flag?: boolean; index?: FakeIndex }) {
  const calls: string[] = [];
  const idx = opts.index ?? {};
  const throwing = () => {
    throw new Error('codeIndex must not be called (no re-parse)');
  };
  const container = {
    config: { repoIntelEnabled: opts.flag ?? true },
    db: {} as never,
    codeIndex: { symbols: throwing, references: throwing, grep: throwing },
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () => {
      calls.push('state');
      return idx.state ?? null;
    },
    getRepoBasics: async () => {
      calls.push('basics');
      return null;
    },
    getSymbolRows: async (_r: string, paths: string[]) => {
      calls.push('symbols');
      return (idx.symbols ?? []).filter((s) => paths.includes(s.path));
    },
    getResolvedCallers: async () => {
      calls.push('callers');
      return idx.callers ?? [];
    },
    getImporters: async (_r: string, files: string[]) => {
      calls.push('importers');
      return (idx.edges ?? []).filter((e) => files.includes(e.toFile));
    },
    getFileFacts: async (_r: string, files: string[]) => {
      calls.push('facts');
      return (idx.facts ?? []).filter((f) => files.includes(f.filePath));
    },
  };
  return { svc, calls };
}

/** lib.ts declares A and B; callers live in their own files. */
function richIndex(status: IndexStatus): FakeIndex {
  const callers: ResolvedCallerRow[] = [];
  const symbols: FullSymbolRow[] = [sym('lib.ts', 'A'), sym('lib.ts', 'B')];
  for (let i = 0; i < 25; i += 1) {
    callers.push({ fromPath: `a${i}.ts`, toSymbol: 'A', line: 3, rank: 100 - i });
    symbols.push(sym(`a${i}.ts`, `useA${i}`));
  }
  for (let i = 0; i < 3; i += 1) {
    callers.push({ fromPath: `b${i}.ts`, toSymbol: 'B', line: 7, rank: 1 });
    symbols.push(sym(`b${i}.ts`, `useB${i}`));
  }
  return {
    state: state(status),
    symbols,
    callers,
    // routes.ts imports b0.ts (hop 2); cron.ts is a direct caller-file fact.
    edges: [{ fromFile: 'routes.ts', toFile: 'b0.ts' }],
    facts: [
      { filePath: 'routes.ts', endpoints: ['GET /x'], crons: [] },
      { filePath: 'b1.ts', endpoints: [], crons: ['0 * * * *'] },
    ],
  };
}

describe('RepoIntel.getBlastRadius — degraded reasons', () => {
  it('flag off → flag_off, without touching the repository or codeIndex', async () => {
    const { svc, calls } = build({ flag: false });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'flag_off', changedSymbols: [], callers: [] });
    expect(calls).toEqual([]);
  });

  it('no changed files → empty and not degraded', async () => {
    const { svc, calls } = build({});
    const r = await svc.getBlastRadius('r1', []);
    expect(r.degraded).toBe(false);
    expect(r.callers).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('no index state → no_data', async () => {
    const { svc } = build({ index: { state: null } });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'no_data' });
    expect(r.indexedSha).toBeUndefined();
  });

  it('failed index → index_failed, no data reads', async () => {
    const { svc, calls } = build({ index: { state: state('failed') } });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'index_failed', indexedSha: 'sha-1' });
    expect(calls).toEqual(['state']);
  });

  it('degraded index keeps a known persisted reason', async () => {
    const { svc } = build({
      index: { state: state('degraded', { degradedReason: 'repo_too_large' }) },
    });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.reason).toBe('repo_too_large');
  });

  it('partial index → persistent data + index_partial', async () => {
    const { svc } = build({ index: richIndex('partial') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
    expect(r.callers.length).toBeGreaterThan(0);
    expect(r.indexedSha).toBe('sha-1');
  });

  it('full index → degraded false + indexedSha', async () => {
    const { svc, calls } = build({ index: richIndex('full') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeUndefined();
    expect(r.indexedSha).toBe('sha-1');
    expect(calls).not.toContain('basics');
  });

  it('full index that left files out (too large / over the cap) → data + repo_too_large', async () => {
    const index = { ...richIndex('full'), state: state('full', { filesLeftOut: 3 }) };
    const { svc } = build({ index });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('repo_too_large');
    expect(r.callers.length).toBeGreaterThan(0);
  });
});

describe('RepoIntel.getBlastRadius — persistent read', () => {
  it('caps callers per symbol: 25 of A + 3 of B → 20 + 3, top-ranked kept', async () => {
    const { svc } = build({ index: richIndex('full') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    const ofA = r.callers.filter((c) => c.viaSymbol === 'A');
    const ofB = r.callers.filter((c) => c.viaSymbol === 'B');
    expect(ofA).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(ofB).toHaveLength(3);
    expect(ofA[0]!.rank).toBe(100);
    expect(ofA.map((c) => c.file)).not.toContain('a24.ts');
  });

  it('labels a caller with its enclosing symbol', async () => {
    const { svc } = build({ index: richIndex('full') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.callers.find((c) => c.file === 'a0.ts')?.symbol).toBe('useA0');
  });

  it("attributes a hop-2 importer's endpoint to the caller file", async () => {
    const { svc } = build({ index: richIndex('full') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.factsByFile?.['b0.ts']?.endpoints).toEqual(['GET /x']);
    expect(r.impactedEndpoints).toEqual(['GET /x']);
  });

  it('keeps crons out of endpoints', async () => {
    const { svc } = build({ index: richIndex('full') });
    const r = await svc.getBlastRadius('r1', ['lib.ts']);
    expect(r.factsByFile?.['b1.ts']).toEqual({ endpoints: [], crons: ['0 * * * *'] });
    expect(r.impactedEndpoints).not.toContain('0 * * * *');
  });

  it('no symbols in the changed files → empty callers, still not degraded', async () => {
    const { svc, calls } = build({ index: { state: state('full') } });
    const r = await svc.getBlastRadius('r1', ['README.md']);
    expect(r).toMatchObject({ degraded: false, changedSymbols: [], callers: [] });
    expect(calls).not.toContain('callers');
  });
});

describe('repo-intel helpers', () => {
  it('capCallersPerSymbol keeps input order and caps per viaSymbol', () => {
    const rows = [
      { viaSymbol: 'A', n: 1 },
      { viaSymbol: 'B', n: 2 },
      { viaSymbol: 'A', n: 3 },
      { viaSymbol: 'A', n: 4 },
    ];
    expect(capCallersPerSymbol(rows, 2).map((r) => r.n)).toEqual([1, 2, 3]);
    expect(capCallersPerSymbol([], 2)).toEqual([]);
  });

  it('attributeFacts dedupes and sorts the union of own + importer facts', () => {
    const out = attributeFacts(
      ['c.ts'],
      [[{ fromFile: 'r.ts', toFile: 'c.ts' }]],
      [
        { filePath: 'c.ts', endpoints: ['POST /b', 'GET /a'], crons: [] },
        { filePath: 'r.ts', endpoints: ['GET /a'], crons: ['@daily'] },
      ],
    );
    expect(out['c.ts']).toEqual({ endpoints: ['GET /a', 'POST /b'], crons: ['@daily'] });
  });

  it('attributeFacts survives an import cycle and respects the hop count', () => {
    const edges = [
      { fromFile: 'b.ts', toFile: 'a.ts' },
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'far.ts', toFile: 'b.ts' },
    ];
    const facts = [{ filePath: 'far.ts', endpoints: ['GET /far'], crons: [] }];
    expect(attributeFacts(['a.ts'], [edges], facts)['a.ts']).toEqual({ endpoints: [], crons: [] });
    expect(attributeFacts(['a.ts'], [edges, edges], facts)['a.ts']?.endpoints).toEqual([
      'GET /far',
    ]);
  });

  it('attributeFacts ignores facts of test files (they inject routes, they do not serve them)', () => {
    const edges = [
      { fromFile: 'routes.ts', toFile: 'svc.ts' },
      { fromFile: 'test/svc.test.ts', toFile: 'svc.ts' },
    ];
    const facts = [
      { filePath: 'routes.ts', endpoints: ['GET /real'], crons: [] },
      { filePath: 'test/svc.test.ts', endpoints: ['GET /agents/${id}/versions/99'], crons: ['0 * * * *'] },
    ];
    expect(attributeFacts(['svc.ts'], [edges], facts)['svc.ts']).toEqual({
      endpoints: ['GET /real'],
      crons: [],
    });
  });

  it('isTestPath matches test files, not source files', () => {
    expect(isTestPath('server/test/blast.it.test.ts')).toBe(true);
    expect(isTestPath('client/src/a/B.test.tsx')).toBe(true);
    expect(isTestPath('test/helpers/pg.ts')).toBe(true);
    expect(isTestPath('server/src/modules/reviews/routes.ts')).toBe(false);
  });

  it('attributeFacts with no callers → {}', () => {
    expect(attributeFacts([], [], [])).toEqual({});
  });

  it('toDegradedReason keeps known reasons, maps the rest to index_failed', () => {
    expect(toDegradedReason('repo_too_large')).toBe('repo_too_large');
    expect(toDegradedReason('disk_full')).toBe('index_failed');
    expect(toDegradedReason(undefined)).toBe('index_failed');
  });
});
