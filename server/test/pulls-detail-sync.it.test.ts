/**
 * GET /repos/:id/pulls keeps `pr_files` / `pr_commits` at each open PR's head.
 * Before, only opening the PR detail wrote them: a PR reviewed via MCP had no
 * files, and one pushed to since kept the old list (Smart Diff, blast radius
 * and the review fallback all read `pr_files`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import * as t from '../src/db/schema.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { PrDetail, PrMeta, RepoRef } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const meta = (head: string): PrMeta => ({
  number: 900,
  title: 'Detail sync',
  author: 'dev',
  branch: 'feat/x',
  base: 'main',
  head_sha: head,
  additions: 0,
  deletions: 0,
  files_count: 0,
  status: 'open',
  opened_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});

const file = (path: string) => ({ path, additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n x\n+y' });
const commit = (sha: string) => ({ sha, message: sha, author: 'dev', committed_at: null });

/** GitHub mock that counts detail fetches (and can fail them). */
class CountingGitHub extends MockGitHubClient {
  detailCalls = 0;
  failDetail = false;
  failList = false;
  override async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    if (this.failList) throw new Error('getaddrinfo ENOTFOUND api.github.com');
    return super.listPullRequests(repo);
  }
  override async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    this.detailCalls++;
    if (this.failDetail) throw new Error('Not Found');
    return super.getPullRequest(repo, n);
  }
}

d('PR list sync refreshes PR detail at head', () => {
  let pg: PgFixture;
  let repoId: string;
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  const listWith = async (github: CountingGitHub) => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient(), github } });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    await app.close();
    expect(res.statusCode).toBe(200);
    return res.json() as { number: number; files_count: number }[];
  };
  const storedPaths = async () => {
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 900));
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    return files.map((f) => f.path).sort();
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const create = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/acme/detail-sync' },
    });
    expect(create.statusCode, create.body).toBe(201);
    repoId = create.json().id;
    await app.container.jobs.onIdle();
    await app.close();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('stores the files of a never-opened PR, refreshes them after a push, then stops fetching', async () => {
    const first = new CountingGitHub({
      pulls: [meta('h1')],
      detail: { head_sha: 'h1', files: [file('src/a.ts')], commits: [commit('h1')], files_count: 1, additions: 1 },
    });
    const list = await listWith(first);
    expect(first.detailCalls).toBe(1);
    expect(await storedPaths()).toEqual(['src/a.ts']);
    expect(list.find((p) => p.number === 900)?.files_count).toBe(1);

    // pushed: new head, one more file
    const pushed = new CountingGitHub({
      pulls: [meta('h2')],
      detail: {
        head_sha: 'h2',
        files: [file('src/a.ts'), file('src/b.ts')],
        commits: [commit('h1'), commit('h2')],
        files_count: 2,
        additions: 2,
      },
    });
    await listWith(pushed);
    expect(pushed.detailCalls).toBe(1);
    expect(await storedPaths()).toEqual(['src/a.ts', 'src/b.ts']);

    // detail already at head → no more detail fetches
    const again = new CountingGitHub({
      pulls: [meta('h2')],
      detail: { head_sha: 'h2', files: [file('src/z.ts')], commits: [commit('h2')], files_count: 1, additions: 1 },
    });
    await listWith(again);
    expect(again.detailCalls).toBe(0);
    expect(await storedPaths()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('a big PR whose commit list omits the head (GitHub caps at 250) is fetched once per head', async () => {
    const big = new CountingGitHub({
      pulls: [meta('h3')],
      detail: { head_sha: 'h3', files: [file('src/c.ts')], commits: [commit('h1')], files_count: 1, additions: 1 },
    });
    await listWith(big);
    await listWith(big);
    expect(big.detailCalls).toBe(1);
    expect(await storedPaths()).toEqual(['src/c.ts']);
  });

  it('a failing detail fetch is not retried at the same head on every list read', async () => {
    const failing = new CountingGitHub({ pulls: [meta('h4')] });
    failing.failDetail = true;
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient(), github: failing } });
    await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    await app.close();
    expect(failing.detailCalls).toBe(1);
  });

  it('no detail fetch while the list sync itself fails (GitHub unreachable)', async () => {
    const offline = new CountingGitHub({ pulls: [meta('h6')] });
    offline.failList = true;
    await listWith(offline);
    expect(offline.detailCalls).toBe(0);
  });

  it('a detail fetched at a newer head than the list row is not refetched', async () => {
    // the list still says h7, GitHub's detail is already at h8 (pushed in between)
    const ahead = new CountingGitHub({
      pulls: [meta('h7')],
      detail: { head_sha: 'h8', files: [file('src/e.ts')], commits: [commit('h8')], files_count: 1, additions: 1 },
    });
    await listWith(ahead);
    expect(ahead.detailCalls).toBe(1);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 900));
    expect([pr!.headSha, pr!.detailHeadSha]).toEqual(['h8', 'h8']);
    // next read: the PR is no longer in the list payload page → stays at h8, fresh
    const later = new CountingGitHub({ pulls: [] });
    await listWith(later);
    expect(later.detailCalls).toBe(0);
  });

  it('two concurrent detail refreshes of one PR leave one row per file', async () => {
    const github = new CountingGitHub({
      pulls: [meta('h5')],
      detail: { head_sha: 'h5', files: [file('src/a.ts'), file('src/d.ts')], commits: [commit('h5')], files_count: 2 },
    });
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient(), github } });
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 900));
    const reads = await Promise.all(
      Array.from({ length: 4 }, () => app.inject({ method: 'GET', url: `/pulls/${pr!.id}` })),
    );
    await app.close();
    expect(reads.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    expect(await storedPaths()).toEqual(['src/a.ts', 'src/d.ts']);
  });
});
