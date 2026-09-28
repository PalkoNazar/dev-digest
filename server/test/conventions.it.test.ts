import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CodeIndex, CodeMatch, ConventionsList } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES: Record<string, string> = {
  'src/users/service.ts': [
    "import { NotFoundError } from '../errors.js';",
    'export async function getUser(id: string) {',
    '  const user = await repo.find(id);',
    "  if (!user) throw new NotFoundError('user');",
    '  return user;',
    '}',
  ].join('\n'),
  'src/orders/routes.ts': [
    "app.get('/orders/:id', async (req) => {",
    '  const order = await orders.get(req.params.id);',
    "  if (!order) throw new NotFoundError('order');",
    '  return order;',
    '});',
  ].join('\n'),
};

const PROPOSAL = {
  conventions: [
    {
      category: 'error-handling',
      rule: 'Throw NotFoundError for a missing entity',
      evidence: [
        { path: 'src/users/service.ts', line_start: 4, line_end: 4, snippet: "if (!user) throw new NotFoundError('user');" },
        { path: 'src/orders/routes.ts', line_start: 3, line_end: 3, snippet: "if (!order) throw new NotFoundError('order');" },
      ],
      detector: { pattern: 'NotFoundError\\(', counter_pattern: 'throw new Error\\(', path_prefix: null },
      confidence: 0.2,
    },
    {
      category: 'async',
      rule: 'Await repository calls directly',
      evidence: [{ path: 'src/users/service.ts', line_start: 3, line_end: 3, snippet: 'const user = await repo.find(id);' }],
      detector: null,
      confidence: 0.9,
    },
  ],
};

/** Fake grep over FILES (the real one walks a clone on disk). */
const codeIndex: CodeIndex = {
  async grep(_repo, pattern): Promise<CodeMatch[]> {
    const re = new RegExp(pattern);
    return Object.entries(FILES).flatMap(([path, text]) =>
      text.split('\n').flatMap((line, i) => (re.test(line) ? [{ path, line: i + 1, text: line }] : [])),
    );
  },
  async symbols() {
    return [];
  },
  async references() {
    return [];
  },
};

const repoIntel = {
  getConventionSamples: async () => Object.keys(FILES),
  getTestSamples: async () => [],
} as unknown as RepoIntel;

/**
 * Conventions Extractor — scan job end to end on a real Postgres: candidates are
 * stored verified and measured, decisions persist across re-scans, pending ones are
 * replaced, and every query is workspace-scoped.
 */
d('Conventions Extractor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let llm: MockLLMProvider;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'shop', fullName: 'acme/shop' })
      .returning();
    repoId = repo!.id;
    llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: PROPOSAL } });
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ files: FILES }),
        codeIndex,
        repoIntel,
        llm: { openai: llm },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function scan(): Promise<ConventionsList> {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('running');
    for (let i = 0; i < 100; i++) {
      const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
      if (list.scan?.status !== 'running') return list;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('scan did not finish');
  }

  it('GET before any scan: no scan, no candidates; unknown repo → 404', async () => {
    const empty = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(empty.json()).toEqual({ scan: null, candidates: [] });
    const missing = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/conventions',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('a scan stores verified, measured candidates', async () => {
    const list = await scan();
    expect(list.scan).toMatchObject({
      status: 'done',
      proposed: 2,
      kept: 2,
      model: 'gpt-5.4-mini',
      sample_paths: Object.keys(FILES),
    });
    const errors = list.candidates.find((c) => c.category === 'error-handling')!;
    expect(errors).toMatchObject({
      status: 'pending',
      adherence: 1,
      support_files: 2,
      violation_files: 0,
      confidence: 0.4,
      edited: false,
    });
    expect(errors.evidence[1]).toEqual({
      path: 'src/orders/routes.ts',
      line_start: 3,
      line_end: 3,
      snippet: "  if (!order) throw new NotFoundError('order');",
    });
    expect(list.candidates.find((c) => c.category === 'async')?.confidence).toBe(0.5);
  });

  it('PATCH accepts, edits (marks edited) and validates', async () => {
    const { candidates } = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
    const id = candidates.find((c) => c.category === 'error-handling')!.id;

    const accepted = await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });
    expect(accepted.json()).toMatchObject({ status: 'accepted', edited: false });
    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { rule: 'Throw NotFoundError (never a bare Error) for a missing entity' },
    });
    expect(edited.json()).toMatchObject({ edited: true, status: 'accepted' });

    expect((await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: {} })).statusCode).toBe(422);
    expect(
      (await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'maybe' } })).statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/conventions/00000000-0000-0000-0000-000000000000',
          payload: { status: 'rejected' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('a re-scan keeps decisions, replaces pending candidates, never re-proposes decided rules', async () => {
    // the accepted rule was edited; reject the other one, then scan again with the same proposal
    const before = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionsList;
    const asyncId = before.candidates.find((c) => c.category === 'async')!.id;
    await app.inject({ method: 'PATCH', url: `/conventions/${asyncId}`, payload: { status: 'rejected' } });

    const after = await scan();
    // "Throw NotFoundError for a missing entity" is new text again (the accepted one was edited)
    expect(after.scan).toMatchObject({ proposed: 2, kept: 1, dropped: { already_decided: 1 } });
    expect(after.candidates.map((c) => c.status).sort()).toEqual(['accepted', 'pending', 'rejected']);

    // the model saw both decisions
    const prompt = (llm.calls.at(-1)!.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(prompt).toContain('- [rejected] Await repository calls directly');
    expect(prompt).toContain('- [accepted] Throw NotFoundError (never a bare Error) for a missing entity');

    // pending of the previous scan was replaced, not accumulated
    const third = await scan();
    expect(third.candidates.filter((c) => c.status === 'pending')).toHaveLength(1);
  });

  it('409 while a scan is running', async () => {
    const repo = new ConventionsRepository(pg.handle.db);
    const running = await repo.createScan(workspaceId, repoId);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    await repo.failScan(workspaceId, running.id, 'test cleanup');
  });

  it('repository: workspace-scoped reads, completeScan only on a running scan, feature model', async () => {
    const repo = new ConventionsRepository(pg.handle.db);
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    expect(await repo.findRepo(other!.id, repoId)).toBeNull();
    expect(await repo.list(other!.id, repoId)).toEqual([]);
    const [anyCandidate] = await repo.list(workspaceId, repoId);
    expect(await repo.get(other!.id, anyCandidate!.id)).toBeNull();
    expect(await repo.update(other!.id, anyCandidate!.id, { status: 'rejected' })).toBeNull();

    const failed = await repo.createScan(workspaceId, repoId);
    await repo.failScan(workspaceId, failed.id, 'timeout');
    const result = {
      samplePaths: [],
      tooling: [],
      model: 'm',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
      proposed: 0,
      kept: 0,
      dropped: {},
    };
    expect(await repo.completeScan(workspaceId, failed.id, result, [])).toBe(false);
    // the timed-out scan wrote nothing: pending candidates survive
    expect((await repo.list(workspaceId, repoId)).some((c) => c.status === 'pending')).toBe(true);

    expect(await repo.featureModel(workspaceId)).toEqual({ provider: 'openai', model: 'gpt-5.4-mini' });
    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      key: 'feature_models',
      value: { conventions: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' } },
    });
    expect(await repo.featureModel(workspaceId)).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    });
  });
});
