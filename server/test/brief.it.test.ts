import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type {
  LLMProvider,
  PrBrief,
  PrBriefResponse,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { makeBrief } from './helpers/brief-fixtures.js';
import * as t from '../src/db/schema.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import type { BriefDraft } from '../src/modules/brief/types.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

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

// ---------------------------------------------------------------------------------
// Plan S9 — `GET|POST /pulls/:id/brief` end to end: buildApp + inject on real
// Postgres, `MockSecretsProvider` + `MockGitHubClient` (no network), an `openai`
// LLM override (the `risk_brief` default) and a stub repo-intel blast source.
// AC-36–AC-39, AC-57, AC-58, AC-60, AC-79, EC-2, EC-4.
// ---------------------------------------------------------------------------------

const ROUTE_DRAFT: BriefDraft = {
  summary: 'Adds a per-user rate limit to the login route.',
  risks: [
    {
      kind: 'security',
      title: 'Spoofable limiter key',
      explanation: 'The key comes from X-Forwarded-For.',
      severity: 'high',
      file_refs: ['src/ratelimit.ts:12-18'],
    },
    { kind: 'correctness', title: 'Invented', explanation: 'e', severity: 'low', file_refs: ['src/invented.ts'] },
  ],
  review_focus: [
    { file: 'src/ratelimit.ts', line: 14, reason: 'Key derivation' },
    { file: 'src/nope.ts', line: 3, reason: 'Invented' },
  ],
};

function routeDeferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** The `openai` provider stand-in: answers at once, fails, or holds a call until released. */
class BriefLLM implements LLMProvider {
  readonly id = 'openai' as const;
  calls: StructuredRequest<unknown>[] = [];
  hold = false;
  fail: Error | null = null;
  held: ReturnType<typeof routeDeferred<StructuredResult<unknown>>>[] = [];
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async embed(texts: string[]) {
    return texts.map(() => []);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    if (this.fail) throw this.fail;
    const answer: StructuredResult<unknown> = {
      data: ROUTE_DRAFT,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: '{}',
      attempts: 1,
    };
    if (!this.hold) return answer as StructuredResult<T>;
    const d = routeDeferred<StructuredResult<unknown>>();
    this.held.push(d);
    const out = await d.promise;
    return { ...out, ...answer } as StructuredResult<T>;
  }
  releaseAll() {
    for (const d of this.held) d.resolve({} as StructuredResult<unknown>);
    this.held = [];
  }
}

const blastIntel = {
  async getBlastRadius() {
    return {
      changedSymbols: [{ file: 'src/ratelimit.ts', name: 'limit', kind: 'function' }],
      callers: [
        { file: 'src/api/handler.ts', symbol: 'handle', viaSymbol: 'limit', viaFile: 'src/ratelimit.ts', line: 40, rank: 1 },
      ],
      impactedEndpoints: [],
      factsByFile: {},
      indexedSha: 'sha-1',
    };
  },
};

async function waitUntil(cond: () => boolean | Promise<boolean>, what: string, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

d('PR Brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let llm: BriefLLM;
  let workspaceId: string;
  let otherWs: string;
  let repoId: string;
  let seq = 100;

  const db = () => pg.handle.db;
  const row = async (prId: string) => (await db().select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0];

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    const [ws] = await db().select().from(t.workspaces);
    workspaceId = ws!.id;
    const [other] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
    otherWs = other!.id;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'brief-shop', fullName: 'acme/brief-shop' })
      .returning();
    repoId = repo!.id;
    llm = new BriefLLM();
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: db(),
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient({ linkedIssues: [], issues: {} }),
        git: new MockGitClient(),
        repoIntel: blastIntel as unknown as RepoIntel,
        llm: { openai: llm },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  function reset() {
    llm.hold = false;
    llm.fail = null;
    llm.held = [];
  }

  /** A fresh PR at head `sha-1` with its files fetched at that head (unless overridden). */
  async function newPull(over: { headSha?: string; detailHeadSha?: string | null; ws?: string } = {}): Promise<string> {
    let rId = repoId;
    if (over.ws) {
      const [r] = await db()
        .insert(t.repos)
        .values({ workspaceId: over.ws, owner: 'other', name: `o${seq}`, fullName: `other/o${seq}` })
        .returning();
      rId = r!.id;
    }
    const [p] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: over.ws ?? workspaceId,
        repoId: rId,
        number: ++seq,
        title: 'Rate-limit logins',
        author: 'dev',
        branch: 'feat/ratelimit',
        base: 'main',
        headSha: over.headSha ?? 'sha-1',
        detailHeadSha: over.detailHeadSha === undefined ? 'sha-1' : over.detailHeadSha,
        body: 'Adds a limiter.',
      })
      .returning();
    await db()
      .insert(t.prFiles)
      .values([
        { prId: p!.id, path: 'src/ratelimit.ts', additions: 20, deletions: 2, patch: '@@ -10,2 +12,7 @@\n+x' },
        { prId: p!.id, path: 'src/login.ts', additions: 1, deletions: 0, patch: '@@ -39,0 +40 @@\n+y' },
      ]);
    return p!.id;
  }

  const get = (prId: string) => app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
  const post = (prId: string) => app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });

  it('GET with no brief → 200 { brief: null, stale: false }, no model call (AC-36, AC-37)', async () => {
    reset();
    const prId = await newPull();
    const before = llm.calls.length;
    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false });
    expect(llm.calls.length).toBe(before);
  });

  it('POST → a grounded brief stored with the snapshot SHA; GET returns it with 0 more calls (AC-36, AC-57)', async () => {
    reset();
    const prId = await newPull();
    const before = llm.calls.length;
    const res = await post(prId);
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrBriefResponse;
    expect(llm.calls.length).toBe(before + 1);
    expect(body.stale).toBe(false);
    expect(body.brief?.summary).toBe(ROUTE_DRAFT.summary);
    expect(body.brief?.risks.risks.map((r) => r.title)).toEqual(['Spoofable limiter key']);
    expect(body.brief?.review_focus.map((f) => f.file)).toEqual(['src/ratelimit.ts']);
    expect(body.brief?.removed).toEqual({ risks: 1, file_refs: 0, review_focus: 1 });
    expect(body.brief?.run).toMatchObject({ provider: 'openai', model: 'gpt-4.1', head_sha: 'sha-1' });
    expect((await row(prId))?.json).toMatchObject({ summary: ROUTE_DRAFT.summary, run: { head_sha: 'sha-1' } });

    const again = await get(prId);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ brief: body.brief, stale: false });
    expect(llm.calls.length).toBe(before + 1);
  });

  it('the PR head moved after generation → GET says stale: true (AC-38, EC-4)', async () => {
    reset();
    const prId = await newPull();
    expect((await post(prId)).statusCode).toBe(200);
    await db().update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, prId));
    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    expect((res.json() as PrBriefResponse).stale).toBe(true);
    expect((res.json() as PrBriefResponse).brief?.run.head_sha).toBe('sha-1');
  });

  it('files not at the head (detail_head_sha ≠ head_sha) → POST 409, 0 model calls, nothing stored (review #1)', async () => {
    reset();
    const prId = await newPull({ headSha: 'sha-2', detailHeadSha: 'sha-1' });
    const before = llm.calls.length;
    const res = await post(prId);
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).toMatch(/resync/i);
    expect(llm.calls.length).toBe(before);
    expect(await row(prId)).toBeUndefined();
  });

  it('no files loaded → POST 409, 0 model calls (AC-60, EC-27)', async () => {
    reset();
    const prId = await newPull();
    await db().delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    const before = llm.calls.length;
    const res = await post(prId);
    expect(res.statusCode).toBe(409);
    expect(llm.calls.length).toBe(before);
  });

  it('an unknown PR or one of another workspace → 404 on GET and POST (AC-39)', async () => {
    reset();
    const foreign = await newPull({ ws: otherWs });
    for (const id of ['00000000-0000-4000-8000-000000000000', foreign]) {
      expect((await get(id)).statusCode).toBe(404);
      expect((await post(id)).statusCode).toBe(404);
    }
    expect(await row(foreign)).toBeUndefined();
  });

  it('a failing model → 5xx and the previous brief stays unchanged (AC-79, EC-31)', async () => {
    reset();
    const prId = await newPull();
    expect((await post(prId)).statusCode).toBe(200);
    const before = await row(prId);
    llm.fail = new Error('provider 500');
    const res = await post(prId);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(await row(prId)).toEqual(before);
  });

  it('the client disconnects mid-generation → the brief is still stored and a GET returns it (AC-58, EC-2)', async () => {
    reset();
    const prId = await newPull();
    llm.hold = true;
    const before = llm.calls.length;
    const ac = new AbortController();
    const request = app
      .inject({ method: 'POST', url: `/pulls/${prId}/brief`, signal: ac.signal })
      .then(
        () => 'answered',
        () => 'aborted',
      );
    await waitUntil(() => llm.held.length === 1, 'the model call to start');
    ac.abort();
    // The aborted inject may settle either way, or not at all — don't depend on it.
    await Promise.race([request, new Promise((r) => setTimeout(r, 500))]);
    llm.releaseAll();
    await waitUntil(async () => (await row(prId)) !== undefined, 'the brief to be stored');
    expect(llm.calls.length).toBe(before + 1);
    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    expect((res.json() as PrBriefResponse).brief?.summary).toBe(ROUTE_DRAFT.summary);
  });
});
