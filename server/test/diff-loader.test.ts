/**
 * loadDiff — the PR head commit is not in the clone until `pull/<n>/head` is
 * fetched. Without that fetch every newer PR fell through to the (empty)
 * pr_files fallback and was reviewed as "0 changed files → approve, 100".
 */
import { describe, it, expect } from 'vitest';
import { loadDiff } from '../src/modules/reviews/diff-loader.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { PullRow } from '../src/db/rows.js';
import type * as schema from '../src/db/schema.js';
import type { RepoRef, UnifiedDiff } from '@devdigest/shared';

const RAW = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n x\n+y';
const EMPTY: UnifiedDiff = parseUnifiedDiff('');

const pull = { id: 'pr-1', number: 31, base: 'main', headSha: 'e3096a7' } as PullRow;
const repoRow = { owner: 'o', name: 'r' } as typeof schema.repos.$inferSelect;

/** Git fake: the head is "in the clone" only after fetchPullHead (unless `headPresent`). */
function fakeGit(opts: { headPresent?: boolean; fetchFails?: boolean; diffAfterFetch?: string } = {}) {
  let fetched = opts.headPresent ?? false;
  const calls = { fetch: [] as { repo: RepoRef; n: number }[], diff: 0 };
  const git = {
    async diff(): Promise<UnifiedDiff> {
      calls.diff++;
      if (!fetched) throw new Error("fatal: bad revision 'main...e3096a7'");
      return parseUnifiedDiff(opts.diffAfterFetch ?? RAW);
    },
    async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
      calls.fetch.push({ repo, n });
      if (opts.fetchFails) throw new Error('fatal: could not read from remote repository');
      fetched = true;
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
  it('uses the clone without fetching when the head is already there', async () => {
    const { container, calls } = fakeGit({ headPresent: true });
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(calls.fetch).toEqual([]);
  });

  it('fetches pull/<n>/head when the head is missing, then diffs again', async () => {
    const { container, calls } = fakeGit();
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(calls.fetch).toEqual([{ repo: { owner: 'o', name: 'r' }, n: 31 }]);
    expect(calls.diff).toBe(2);
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('falls back to stored pr_files patches when the fetch fails', async () => {
    const { container, calls } = fakeGit({ fetchFails: true });
    const diff = await loadDiff(container, fakeRepo('@@ -1,1 +1,2 @@\n x\n+z'), 'ws', pull, repoRow);
    expect(calls.fetch).toHaveLength(1);
    expect(diff.files.map((f) => f.path)).toEqual(['src/b.ts']);
  });

  it('returns an empty diff when nothing has the PR — the caller fails the run', async () => {
    const { container } = fakeGit({ fetchFails: true });
    const diff = await loadDiff(container, fakeRepo(), 'ws', pull, repoRow);
    expect(diff).toEqual(EMPTY);
  });
});
