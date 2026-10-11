/**
 * loadDiff — the PR head commit is not in the clone until `pull/<n>/head` is
 * fetched (without it every newer PR fell through to the empty pr_files fallback
 * and was reviewed as "0 changed files → approve, 100"), and the clone's local
 * `<base>` is stale (diffing against it pulled other PRs' merged files into the
 * review) — so the base comes from a freshly fetched `origin/<base>`.
 */
import { describe, it, expect } from 'vitest';
import { loadDiff } from '../src/modules/reviews/diff-loader.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { RunBus } from '../src/platform/sse.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { AgentRow, PullRow } from '../src/db/rows.js';
import type * as schema from '../src/db/schema.js';
import type { RepoRef, UnifiedDiff } from '@devdigest/shared';

const RAW = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+y';
const EMPTY: UnifiedDiff = parseUnifiedDiff('');

const pull = { id: 'pr-1', number: 31, base: 'main', headSha: 'e3096a7' } as PullRow;
const repoRow = { owner: 'o', name: 'r' } as typeof schema.repos.$inferSelect;

/**
 * Git fake with refs: fetchPullHead brings the PR head and `origin/<base>`;
 * `headPresent` / `refs` describe what the clone already had before.
 */
function fakeGit(opts: { headPresent?: boolean; fetchFails?: boolean; refs?: string[]; emptyOn?: string[] } = {}) {
  let headPresent = opts.headPresent ?? false;
  const refs = new Set(opts.refs ?? []);
  const calls = { fetch: [] as { repo: RepoRef; n: number; base?: string }[], diffBases: [] as string[] };
  const git = {
    async diff(_repo: RepoRef, base: string): Promise<UnifiedDiff> {
      calls.diffBases.push(base);
      if (!headPresent || !refs.has(base)) throw new Error(`fatal: bad revision '${base}...e3096a7'`);
      return parseUnifiedDiff(opts.emptyOn?.includes(base) ? '' : RAW);
    },
    async fetchPullHead(repo: RepoRef, n: number, base?: string): Promise<void> {
      calls.fetch.push({ repo, n, base });
      if (opts.fetchFails) throw new Error('fatal: could not read from remote repository');
      headPresent = true;
      if (base) refs.add(`origin/${base}`);
    },
  };
  return { container: { git } as unknown as Container, calls };
}

function fakeRepo(patch: string | null = null) {
  return {
    async getPrFiles() {
      return patch ? [{ path: 'src/b.ts', patch }] : [];
    },
  } as unknown as ReviewRepository;
}

describe('loadDiff', () => {
  it('fetches the PR head and the base, then diffs against origin/<base>', async () => {
    const { container, calls } = fakeGit();
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(calls.fetch).toEqual([{ repo: { owner: 'o', name: 'r' }, n: 31, base: 'main' }]);
    expect(calls.diffBases).toEqual(['origin/main']);
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('never diffs against a stale local <base> when origin/<base> works', async () => {
    const { container, calls } = fakeGit({ headPresent: true, refs: ['main'] });
    await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(calls.diffBases).toEqual(['origin/main']);
  });

  it('an empty origin/<base> diff (head already merged) never falls through to the stale local <base>', async () => {
    const { container, calls } = fakeGit({ refs: ['main'], emptyOn: ['origin/main'] });
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(calls.diffBases).toEqual(['origin/main']);
    expect(diff).toEqual(EMPTY);
  });

  it('offline: uses origin/<base> already in the clone, then the local <base>', async () => {
    const withOrigin = fakeGit({ fetchFails: true, headPresent: true, refs: ['origin/main'] });
    await loadDiff(withOrigin.container, fakeRepo(), 'ws', pull, repoRow);
    expect(withOrigin.calls.diffBases).toEqual(['origin/main']);

    const localOnly = fakeGit({ fetchFails: true, headPresent: true, refs: ['main'] });
    const diff = await loadDiff(localOnly.container, fakeRepo(), 'ws', pull, repoRow);
    expect(localOnly.calls.diffBases).toEqual(['origin/main', 'main']);
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('falls back to stored pr_files patches when the clone has no head', async () => {
    const { container } = fakeGit({ fetchFails: true });
    const diff = await loadDiff(container, fakeRepo('@@ -1,1 +1,2 @@\n x\n+z'), 'ws', pull, repoRow);
    expect(diff.files.map((f) => f.path)).toEqual(['src/b.ts']);
  });

  it('returns an empty diff when nothing has the PR — the caller fails the run', async () => {
    const { container } = fakeGit({ fetchFails: true });
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(diff).toEqual(EMPTY);
  });
});

describe('ReviewRunExecutor — empty diff', () => {
  it('fails every queued run with the reason instead of reviewing 0 files', async () => {
    const { container: base } = fakeGit({ fetchFails: true });
    const bus = new RunBus();
    const container = { ...base, runBus: bus } as unknown as Container;
    const completed: { runId: string; status: string; error?: string | null }[] = [];
    const traces: string[] = [];
    const repo = {
      async getPrFiles() {
        return [];
      },
      async completeAgentRun(runId: string, v: { status: string; error?: string | null }) {
        completed.push({ runId, status: v.status, error: v.error });
      },
      async saveRunTrace(runId: string) {
        traces.push(runId);
      },
    } as unknown as ReviewRepository;
    const agent = { name: 'General', version: 1, provider: 'openrouter', model: 'm', systemPrompt: '' } as AgentRow;
    const executor = new ReviewRunExecutor(container, repo, {} as Container['agentsRepo']);

    await executor.executeRuns('ws', pull, repoRow, [
      { agent, runId: 'run-a' },
      { agent, runId: 'run-b' },
    ]);

    expect(completed.map((c) => [c.runId, c.status])).toEqual([
      ['run-a', 'failed'],
      ['run-b', 'failed'],
    ]);
    expect(completed[0]?.error).toMatch(/^PR diff is empty — head e3096a7 could not be diffed against main/);
    expect(traces).toEqual(['run-a', 'run-b']);
    expect(bus.buffer('run-a').some((e) => e.msg.startsWith('PR diff is empty'))).toBe(true);
  });
});
