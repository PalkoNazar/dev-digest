import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * L04 — GET /pulls/:id/blast and GET /repos/:id/pulls/:number/blast against a
 * real Postgres (workspace scoping, pr_files lookup, contract validation). The
 * repo-intel facade is a fake: these tests cover the blast module, not the index.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast.it] Docker not available — skipping blast integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SEEDED_FILES = [
  'src/api/public/webhooks.ts',
  'src/api/users.ts',
  'src/config.ts',
  'src/middleware/ratelimit.ts',
];

function fakeRepoIntel(result: Partial<BlastResult> = {}) {
  const calls: Array<{ repoId: string; files: string[] }> = [];
  const fake = {
    getBlastRadius: async (repoId: string, files: string[]): Promise<BlastResult> => {
      calls.push({ repoId, files: [...files].sort() });
      return {
        changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
        callers: [
          { file: 'src/api/router.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 2 },
        ],
        impactedEndpoints: ['GET /public'],
        factsByFile: { 'src/api/router.ts': { endpoints: ['GET /public'], crons: [] } },
        degraded: false,
        indexedSha: 'idx-sha',
        ...result,
      };
    },
  };
  return { repoIntel: fake as unknown as RepoIntel, calls };
}

d('blast routes (Testcontainers)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;
  let otherRepoId: string;
  let otherPrId: string;

  beforeAll(async () => {
    pg = await startPg();
    const { db } = pg.handle;
    ({ workspaceId } = await seed(db));
    const [repo] = await db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    repoId = repo!.id;
    const [pr] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
    prId = pr!.id;

    // A PR in ANOTHER workspace — must never be readable from the default one.
    const [ws2] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [repo2] = await db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'evil', name: 'corp', fullName: 'evil/corp' })
      .returning();
    otherRepoId = repo2!.id;
    const [pr2] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws2!.id,
        repoId: otherRepoId,
        number: 9,
        title: 'secret',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'deadbeef',
      })
      .returning();
    otherPrId = pr2!.id;
    await db.insert(t.prFiles).values({ prId: otherPrId, path: 'secret.ts' });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function app(repoIntel: RepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel, secrets: new MockSecretsProvider(), github: new MockGitHubClient() },
    });
  }

  it('GET /pulls/:id/blast → 200, contract-valid, fake got the seeded paths', async () => {
    const { repoIntel, calls } = fakeRepoIntel();
    const a = await app(repoIntel);
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.downstream[0]).toMatchObject({
      symbol: 'rateLimit',
      callers: [{ name: 'publicRouter', file: 'src/api/router.ts', line: 23 }],
      endpoints_affected: ['GET /public'],
    });
    expect(body.index_sha).toBe('idx-sha');
    expect(calls).toEqual([{ repoId, files: SEEDED_FILES }]);
    await a.close();
  });

  it('GET /repos/:id/pulls/:number/blast → same map by number', async () => {
    const { repoIntel, calls } = fakeRepoIntel();
    const a = await app(repoIntel);
    const byNumber = await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls/482/blast` });
    const byId = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(byNumber.statusCode).toBe(200);
    expect(BlastRadius.parse(byNumber.json())).toEqual(BlastRadius.parse(byId.json()));
    expect(calls[0]).toEqual({ repoId, files: SEEDED_FILES });
    await a.close();
  });

  it('unknown PR uuid / unknown number → 404', async () => {
    const { repoIntel, calls } = fakeRepoIntel();
    const a = await app(repoIntel);
    const r1 = await a.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/blast',
    });
    const r2 = await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls/999999/blast` });
    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
    expect(r2.json().error.message).toContain('#999999');
    expect(calls).toHaveLength(0);
    await a.close();
  });

  it('PR in another workspace → 404 on both routes, facade never called', async () => {
    const { repoIntel, calls } = fakeRepoIntel();
    const a = await app(repoIntel);
    const r1 = await a.inject({ method: 'GET', url: `/pulls/${otherPrId}/blast` });
    const r2 = await a.inject({ method: 'GET', url: `/repos/${otherRepoId}/pulls/9/blast` });
    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
    await a.close();
  });

  it('index_partial passes through as degraded + reason', async () => {
    const { repoIntel } = fakeRepoIntel({ degraded: true, reason: 'index_partial' });
    const a = await app(repoIntel);
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ degraded: true, reason: 'index_partial' });
    await a.close();
  });

  it('the number route does not write pull_requests', async () => {
    const { repoIntel } = fakeRepoIntel();
    const a = await app(repoIntel);
    const countPulls = async () =>
      (await pg.handle.db.select({ n: count() }).from(t.pullRequests))[0]!.n;
    const before = await countPulls();
    await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls/482/blast` });
    await a.inject({ method: 'GET', url: `/repos/${repoId}/pulls/1234/blast` });
    expect(await countPulls()).toBe(before);
    await a.close();
  });
});
