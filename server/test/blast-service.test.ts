import { describe, it, expect } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type {
  BlastPull,
  BlastRepo,
  BlastSource,
  BlastSourceResult,
} from '../src/modules/blast/ports.js';

/** L04 — BlastService with hand-written fakes of its ports (no DB, no container). */

const PULL: BlastPull = { id: 'pr-1', repoId: 'repo-1' };

function fakeRepo(pull: BlastPull | null, files: string[] = ['src/lib.ts']): BlastRepo {
  return {
    findPull: async (_ws, id) => (pull && pull.id === id ? pull : null),
    findPullByNumber: async (_ws, repoId, n) =>
      pull && pull.repoId === repoId && n === 7 ? pull : null,
    listChangedFiles: async () => files,
  };
}

function fakeSource(result: Partial<BlastSourceResult> = {}) {
  const calls: Array<{ repoId: string; files: string[] }> = [];
  const source: BlastSource = {
    getBlastRadius: async (repoId, files) => {
      calls.push({ repoId, files });
      return {
        changedSymbols: [{ file: 'src/lib.ts', name: 'slugify', kind: 'function' }],
        callers: [{ file: 'src/a.ts', symbol: 'handle', viaSymbol: 'slugify', line: 3, rank: 1 }],
        impactedEndpoints: ['GET /a'],
        factsByFile: { 'src/a.ts': { endpoints: ['GET /a'], crons: [] } },
        degraded: false,
        ...result,
      };
    },
  };
  return { source, calls };
}

function fakeLog() {
  const lines: Array<{ obj: Record<string, unknown>; msg: string }> = [];
  return {
    lines,
    log: { info: (obj: object, msg: string) => lines.push({ obj: obj as Record<string, unknown>, msg }) },
  };
}

describe('BlastService', () => {
  it('forPull: unknown PR → NotFoundError, source not called', async () => {
    const { source, calls } = fakeSource();
    const svc = new BlastService({ repo: fakeRepo(null), source });
    await expect(svc.forPull('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(calls).toHaveLength(0);
  });

  it('forPullNumber: unknown PR → NotFoundError naming the number + import hint', async () => {
    const { source, calls } = fakeSource();
    const svc = new BlastService({ repo: fakeRepo(PULL), source });
    const err = await svc.forPullNumber('ws', 'repo-1', 99).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).message).toContain('#99');
    expect((err as Error).message).toContain('import/sync');
    expect(calls).toHaveLength(0);
  });

  it("calls the source once with the PR's repoId and changed files", async () => {
    const { source, calls } = fakeSource();
    const svc = new BlastService({ repo: fakeRepo(PULL, ['src/lib.ts', 'README.md']), source });
    const blast = await svc.forPull('ws', 'pr-1');
    expect(calls).toEqual([{ repoId: 'repo-1', files: ['src/lib.ts', 'README.md'] }]);
    expect(blast.downstream[0]?.symbol).toBe('slugify');
  });

  it('forPullNumber resolves through the same build', async () => {
    const { source, calls } = fakeSource();
    const svc = new BlastService({ repo: fakeRepo(PULL), source });
    const byNumber = await svc.forPullNumber('ws', 'repo-1', 7);
    const byId = await svc.forPull('ws', 'pr-1');
    expect(byNumber).toEqual(byId);
    expect(calls).toHaveLength(2);
  });

  it('logs one line: index source + counts, never contents', async () => {
    const { source } = fakeSource();
    const { log, lines } = fakeLog();
    const svc = new BlastService({ repo: fakeRepo(PULL), source });
    await svc.forPull('ws', 'pr-1', log);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toBe('blast: read repo-intel index (no re-parse, no LLM)');
    expect(lines[0]!.obj).toMatchObject({
      prId: 'pr-1',
      repoId: 'repo-1',
      changedFiles: 1,
      source: 'repo-intel-index',
      degraded: false,
      symbols: 1,
      callers: 1,
      endpoints: 1,
      crons: 0,
    });
    expect(typeof lines[0]!.obj.ms).toBe('number');
  });

  it('degraded + reason flow through to the contract and the log', async () => {
    const { source } = fakeSource({ callers: [], degraded: true, reason: 'index_partial' });
    const { log, lines } = fakeLog();
    const svc = new BlastService({ repo: fakeRepo(PULL), source });
    const blast = await svc.forPull('ws', 'pr-1', log);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(lines[0]!.obj).toMatchObject({ degraded: true, reason: 'index_partial' });
  });
});
