import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { blastSummary, toBlastRadius } from '../src/modules/blast/helpers.js';
import type { BlastSourceResult } from '../src/modules/blast/ports.js';

/** L04 — pure mapping of the repo-intel facade result to the BlastRadius contract. */

function source(overrides: Partial<BlastSourceResult> = {}): BlastSourceResult {
  return {
    changedSymbols: [
      { file: 'src/lib.ts', name: 'slugify', kind: 'function' },
      { file: 'src/lib.ts', name: 'parse', kind: 'function' },
    ],
    callers: [
      { file: 'src/api/a.ts', symbol: 'handleA', viaSymbol: 'slugify', line: 12, rank: 9 },
      { file: 'src/jobs/n.ts', symbol: 'nightly', viaSymbol: 'parse', line: 4, rank: 5 },
      { file: 'src/api/b.ts', symbol: 'handleB', viaSymbol: 'slugify', line: 30, rank: 3 },
      { file: 'src/api/a.ts', symbol: 'handleA2', viaSymbol: 'parse', line: 40, rank: 9 },
    ],
    impactedEndpoints: ['GET /a', 'POST /b'],
    factsByFile: {
      'src/api/a.ts': { endpoints: ['GET /a'], crons: [] },
      'src/api/b.ts': { endpoints: ['POST /b', 'GET /a'], crons: [] },
      'src/jobs/n.ts': { endpoints: [], crons: ['0 3 * * *'] },
    },
    degraded: false,
    indexedSha: 'abc',
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups flat callers per changed symbol, keeping rank order', () => {
    const b = toBlastRadius(source());
    const slug = b.downstream.find((d) => d.symbol === 'slugify')!;
    expect(slug.callers).toEqual([
      { name: 'handleA', file: 'src/api/a.ts', line: 12 },
      { name: 'handleB', file: 'src/api/b.ts', line: 30 },
    ]);
    expect(b.changed_symbols).toEqual([
      { name: 'slugify', file: 'src/lib.ts', kind: 'function' },
      { name: 'parse', file: 'src/lib.ts', kind: 'function' },
    ]);
  });

  it('keeps endpoints and crons per group, separate, sorted and deduped', () => {
    const b = toBlastRadius(source());
    const slug = b.downstream.find((d) => d.symbol === 'slugify')!;
    const parse = b.downstream.find((d) => d.symbol === 'parse')!;
    expect(slug.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(slug.crons_affected).toEqual([]);
    expect(parse.endpoints_affected).toEqual(['GET /a']);
    expect(parse.crons_affected).toEqual(['0 3 * * *']);
  });

  it('drops a caller living in a file that declares the same-named changed symbol', () => {
    const b = toBlastRadius(
      source({
        callers: [
          { file: 'src/lib.ts', symbol: 'inner', viaSymbol: 'slugify', line: 2, rank: 50 },
          { file: 'src/api/a.ts', symbol: 'handleA', viaSymbol: 'slugify', line: 12, rank: 9 },
        ],
      }),
    );
    expect(b.downstream).toHaveLength(1);
    expect(b.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/api/a.ts']);
  });

  it('keeps same-named symbols declared in different files as separate groups', () => {
    const out = toBlastRadius(
      source({
        changedSymbols: [
          { file: 'src/a/handler.ts', name: 'handler', kind: 'function' },
          { file: 'src/b/handler.ts', name: 'handler', kind: 'function' },
        ],
        callers: [
          { file: 'src/api/a.ts', symbol: 'x', viaSymbol: 'handler', viaFile: 'src/a/handler.ts', line: 1, rank: 9 },
          { file: 'src/jobs/n.ts', symbol: 'y', viaSymbol: 'handler', viaFile: 'src/b/handler.ts', line: 2, rank: 5 },
        ],
      }),
    );
    expect(out.downstream.map((d) => [d.symbol, d.file, d.callers.map((c) => c.file)])).toEqual([
      ['handler', 'src/a/handler.ts', ['src/api/a.ts']],
      ['handler', 'src/b/handler.ts', ['src/jobs/n.ts']],
    ]);
    expect(out.downstream[0]?.endpoints_affected).toEqual(['GET /a']);
    expect(out.downstream[1]?.crons_affected).toEqual(['0 3 * * *']);
  });

  it('sorts downstream by max caller rank, then caller count, then symbol', () => {
    const b = toBlastRadius(
      source({
        callers: [
          { file: 'x.ts', symbol: 'x', viaSymbol: 'zeta', line: 1, rank: 1 },
          { file: 'y.ts', symbol: 'y', viaSymbol: 'beta', line: 1, rank: 7 },
          { file: 'z.ts', symbol: 'z', viaSymbol: 'alpha', line: 1, rank: 7 },
          { file: 'w.ts', symbol: 'w', viaSymbol: 'gamma', line: 1, rank: 7 },
          { file: 'v.ts', symbol: 'v', viaSymbol: 'gamma', line: 1, rank: 2 },
        ],
        factsByFile: {},
      }),
    );
    expect(b.downstream.map((d) => d.symbol)).toEqual(['gamma', 'alpha', 'beta', 'zeta']);
  });

  it('computes stats with distinct endpoints/crons across groups', () => {
    const b = toBlastRadius(source());
    expect(b.stats).toEqual({ symbols: 2, callers: 4, endpoints: 2, crons: 1 });
    expect(b.summary).toBe('2 changed symbols · 4 callers · 2 endpoints · 1 cron');
    expect(b.degraded).toBe(false);
    expect(b.reason).toBeUndefined();
    expect(b.index_sha).toBe('abc');
  });

  it('no callers → downstream []', () => {
    const b = toBlastRadius(source({ callers: [], factsByFile: undefined }));
    expect(b.downstream).toEqual([]);
    expect(b.stats).toEqual({ symbols: 2, callers: 0, endpoints: 0, crons: 0 });
  });

  it('without factsByFile, groups carry empty endpoints/crons', () => {
    const b = toBlastRadius(source({ factsByFile: undefined }));
    for (const d of b.downstream) {
      expect(d.endpoints_affected).toEqual([]);
      expect(d.crons_affected).toEqual([]);
    }
  });

  it('passes degraded + reason through and prefixes the summary', () => {
    const b = toBlastRadius(
      source({ callers: [], degraded: true, reason: 'index_partial', indexedSha: undefined }),
    );
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('index_partial');
    expect(b.index_sha).toBeNull();
    expect(b.summary.startsWith('Index partial — ')).toBe(true);
  });

  it('output always parses as the BlastRadius contract', () => {
    expect(() => BlastRadius.parse(toBlastRadius(source()))).not.toThrow();
    expect(() =>
      BlastRadius.parse(
        toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'flag_off' }),
      ),
    ).not.toThrow();
  });
});

describe('blastSummary', () => {
  it('uses singular forms and a generic degraded prefix without a reason', () => {
    expect(blastSummary({ symbols: 1, callers: 1, endpoints: 0, crons: 2 }, true)).toBe(
      'Index incomplete — 1 changed symbol · 1 caller · 0 endpoints · 2 crons',
    );
  });
});
