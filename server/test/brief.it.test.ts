import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeBrief } from './helpers/brief-fixtures.js';
import * as t from '../src/db/schema.js';
import { BriefRepository } from '../src/modules/brief/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SPEC-03 (L05 PR Brief), plan S5 — `BriefRepository` against real Postgres:
 * read with the PR head, consistent snapshot, validated atomic upsert, workspace
 * scoping, the `risk_brief` feature model. AC-36–AC-39, AC-43, AC-57, AC-79, EC-4.
 * (S9 extends this file with the route-level cases.)
 */
d('BriefRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: BriefRepository;
  let wsA: string;
  let wsB: string;
  let prA: string;
  let prEmpty: string;
  let prB: string;

  const db = () => pg.handle.db;
  const briefRow = async (prId: string) =>
    (await db().select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0];

  beforeAll(async () => {
    pg = await startPg();
    repo = new BriefRepository(db());
    const [a, b] = await db().insert(t.workspaces).values([{ name: 'a' }, { name: 'b' }]).returning();
    wsA = a!.id;
    wsB = b!.id;
    const [repoA] = await db()
      .insert(t.repos)
      .values({ workspaceId: wsA, owner: 'acme', name: 'shop', fullName: 'acme/shop' })
      .returning();
    const [repoB] = await db()
      .insert(t.repos)
      .values({ workspaceId: wsB, owner: 'other', name: 'app', fullName: 'other/app' })
      .returning();
    const pull = (workspaceId: string, repoId: string, number: number) => ({
      workspaceId,
      repoId,
      number,
      title: 'Rate-limit logins',
      author: 'dev',
      branch: 'feat/ratelimit',
      base: 'main',
      headSha: 'sha-a',
      detailHeadSha: 'sha-a',
      body: 'Closes #12',
    });
    const [pA] = await db().insert(t.pullRequests).values(pull(wsA, repoA!.id, 7)).returning();
    const [pE] = await db()
      .insert(t.pullRequests)
      .values({ ...pull(wsA, repoA!.id, 8), body: null, detailHeadSha: null })
      .returning();
    const [pB] = await db().insert(t.pullRequests).values(pull(wsB, repoB!.id, 7)).returning();
    prA = pA!.id;
    prEmpty = pE!.id;
    prB = pB!.id;
    await db()
      .insert(t.prFiles)
      .values([
        { prId: prA, path: 'src/ratelimit.ts', additions: 20, deletions: 2, patch: '@@ -1,2 +1,20 @@\n+x' },
        { prId: prA, path: 'assets/logo.png', additions: 0, deletions: 0, patch: null },
        { prId: prB, path: 'src/other.ts', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+y' },
      ]);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  describe('readBrief', () => {
    it('returns the head and brief: null before any brief is stored (AC-37)', async () => {
      expect(await repo.readBrief(wsA, prA)).toEqual({ headSha: 'sha-a', brief: null });
    });

    it('returns null for a PR outside the workspace and an unknown id (AC-39)', async () => {
      expect(await repo.readBrief(wsB, prA)).toBeNull();
      expect(await repo.readBrief(wsA, prB)).toBeNull();
      expect(await repo.readBrief(wsA, '00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('saveBrief', () => {
    it('stores a brief that readBrief returns (round-trip, AC-36)', async () => {
      const brief = makeBrief();
      const stored = await repo.saveBrief(wsA, prA, brief);
      expect(stored).toEqual({ brief, headSha: 'sha-a' });
      expect(await repo.readBrief(wsA, prA)).toEqual({ headSha: 'sha-a', brief });
    });

    it('a second save replaces the first, one row per PR (AC-57)', async () => {
      const second = makeBrief({ summary: 'Second brief.', run: { head_sha: 'sha-a', tokens_in: 1 } });
      await repo.saveBrief(wsA, prA, second);
      expect((await repo.readBrief(wsA, prA))?.brief?.summary).toBe('Second brief.');
      expect(await db().select().from(t.prBrief).where(eq(t.prBrief.prId, prA))).toHaveLength(1);
    });

    it('another workspace gets null and writes nothing (AC-39)', async () => {
      const before = await briefRow(prA);
      expect(await repo.saveBrief(wsB, prA, makeBrief({ summary: 'hijack' }))).toBeNull();
      expect(await briefRow(prA)).toEqual(before);
      expect(await briefRow(prB)).toBeUndefined();
    });

    it('rejects an invalid brief with code invalid_brief and leaves the row unchanged (AC-79)', async () => {
      const before = await briefRow(prA);
      const invalid = {
        ...makeBrief({ summary: 'must not be stored' }),
        review_focus: [{ file: 'src/a.ts', line: 0, reason: 'r', outside_changed_lines: false }],
      } as PrBrief;
      await expect(repo.saveBrief(wsA, prA, invalid)).rejects.toMatchObject({ code: 'invalid_brief' });
      expect(await briefRow(prA)).toEqual(before);
    });

    it('returns the PR\'s current head from the same write, not the brief\'s SHA (EC-4)', async () => {
      await db().update(t.pullRequests).set({ headSha: 'sha-b' }).where(eq(t.pullRequests.id, prA));
      const stored = await repo.saveBrief(wsA, prA, makeBrief({ run: { head_sha: 'sha-a' } }));
      expect(stored?.headSha).toBe('sha-b');
      expect(stored?.brief.run.head_sha).toBe('sha-a');
      expect(await repo.readBrief(wsA, prA)).toMatchObject({ headSha: 'sha-b' });
      await db().update(t.pullRequests).set({ headSha: 'sha-a' }).where(eq(t.pullRequests.id, prA));
    });
  });

  it('reads an invalid stored JSON as brief: null (AC-37)', async () => {
    await db().insert(t.prBrief).values({ prId: prEmpty, json: { summary: 42 } });
    expect(await repo.readBrief(wsA, prEmpty)).toEqual({ headSha: 'sha-a', brief: null });
  });

  describe('snapshot', () => {
    it('returns the PR row with both head SHAs, its repo and its files (AC-40, EC-4)', async () => {
      const snap = await repo.snapshot(wsA, prA);
      expect(snap?.pull).toMatchObject({
        id: prA,
        number: 7,
        title: 'Rate-limit logins',
        body: 'Closes #12',
        branch: 'feat/ratelimit',
        headSha: 'sha-a',
        detailHeadSha: 'sha-a',
        repo: { owner: 'acme', name: 'shop' },
      });
      const files = [...(snap?.files ?? [])].sort((x, y) => x.path.localeCompare(y.path));
      expect(files).toEqual([
        { path: 'assets/logo.png', additions: 0, deletions: 0, patch: null },
        { path: 'src/ratelimit.ts', additions: 20, deletions: 2, patch: '@@ -1,2 +1,20 @@\n+x' },
      ]);
    });

    it('returns a PR with no files and a null detail head as is (EC-27)', async () => {
      const snap = await repo.snapshot(wsA, prEmpty);
      expect(snap?.pull).toMatchObject({ id: prEmpty, body: null, detailHeadSha: null, headSha: 'sha-a' });
      expect(snap?.files).toEqual([]);
    });

    it('returns null for a PR outside the workspace (AC-39)', async () => {
      expect(await repo.snapshot(wsB, prA)).toBeNull();
      expect(await repo.snapshot(wsA, prB)).toBeNull();
    });
  });

  describe('featureModel (AC-43)', () => {
    it('falls back to the risk_brief registry default', async () => {
      expect(await repo.featureModel(wsA)).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    });

    it('uses the workspace feature_models.risk_brief setting, scoped by workspace', async () => {
      await db()
        .insert(t.settings)
        .values({
          workspaceId: wsB,
          key: 'feature_models',
          value: { risk_brief: { provider: 'anthropic', model: 'claude-x' }, review_intent: { provider: 'openai', model: 'o' } },
        });
      expect(await repo.featureModel(wsB)).toEqual({ provider: 'anthropic', model: 'claude-x' });
      expect(await repo.featureModel(wsA)).toEqual({ provider: 'openai', model: 'gpt-4.1' });
      await db()
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, wsB), eq(t.settings.key, 'feature_models')));
    });
  });
});
