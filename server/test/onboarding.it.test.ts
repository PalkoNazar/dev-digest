import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type {
  LLMProvider,
  OnboardingGeneration,
  OnboardingView,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { TourDraft } from '../src/modules/onboarding/types.js';

/**
 * SPEC-02 (L05 Onboarding Tour) — plan S12 (+ S4/S10 storage), amendments A11, A12.
 * Routes + the generate job end to end on a real Postgres: buildApp + inject, mocked
 * git / repo-intel / LLM. The `openrouter` LLM override is served before any key
 * lookup (A12); `MockSecretsProvider` keeps everything else off the network.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'shop', scripts: { dev: 'tsx watch src/server.ts' } }),
  'pnpm-lock.yaml': 'lockfileVersion: 9.0',
  'README.md': '# Shop\n\nThe demo shop.',
  'src/server.ts': 'export function start() {}',
  'src/a.ts': 'export const a = 1;',
  'src/b.ts': 'export const b = 2;',
};
const INDEX_SHA = 'idxsha1111111111';

function draft(firstTasks: string): TourDraft {
  return {
    architecture: { body_md: 'A Fastify API; it starts in `src/server.ts`.', diagram: null },
    critical_paths: { body_md: null, descriptions: [{ root: 'src/server.ts', description: 'Boots the server.' }] },
    run_locally: { body_md: null, steps: [{ command: 'pnpm install' }, { command: 'pnpm dev' }] },
    reading_path: { body_md: null, reasons: [{ path: 'src/a.ts', reason: 'Core logic.' }] },
    first_tasks: { body_md: firstTasks },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** An OpenRouter stand-in: answers at once, fails, or holds each call until released. */
class GatedLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  calls: StructuredRequest<unknown>[] = [];
  hold = false;
  fail: Error | null = null;
  firstTasks = 'Add a test for `src/b.ts`.';
  pending: { firstTasks: string; d: ReturnType<typeof deferred<StructuredResult<unknown>>> }[] = [];

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
    if (this.hold) {
      const d = deferred<StructuredResult<unknown>>();
      this.pending.push({ firstTasks: this.firstTasks, d });
      return (await d.promise) as StructuredResult<T>;
    }
    return GatedLLM.result(req.model, this.firstTasks) as StructuredResult<T>;
  }
  /** Releases the i-th held call with the answer it was given when it arrived. */
  release(i: number) {
    const p = this.pending[i]!;
    p.d.resolve(GatedLLM.result('deepseek/deepseek-v4-flash', p.firstTasks));
  }
  static result(model: string, firstTasks: string): StructuredResult<unknown> {
    return {
      data: draft(firstTasks),
      model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: '{}',
      attempts: 1,
    };
  }
}

/** A full index over FILES (mutable per test). */
const intel = {
  status: 'full' as 'full' | 'failed',
  async getIndexState(repoId: string) {
    return {
      repoId,
      status: this.status,
      filesIndexed: 3,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: INDEX_SHA,
      indexerVersion: 1,
      updatedAt: new Date(),
      filesLeftOut: 0,
      ...(this.status === 'failed' ? { reason: 'index_failed' } : {}),
    };
  },
  async getTopFilesByRank() {
    return ['src/server.ts', 'src/a.ts', 'src/b.ts'];
  },
  async getCriticalPaths() {
    return [['src/server.ts', 'src/a.ts']];
  },
  async getFileRank(_repoId: string, paths: string[]) {
    return paths.filter((p) => p.startsWith('src/')).map((path) => ({ path, percentile: 0.5 }));
  },
  async getBlastRadius() {
    return { changedSymbols: [], callers: [], impactedEndpoints: [], factsByFile: {} };
  },
  async getRepoMap() {
    return { text: 'src/server.ts', tokens: 3, cached: true };
  },
  async getSymbolsInFiles() {
    return [];
  },
  async getImporterCounts(_repoId: string, paths: string[]) {
    return Object.fromEntries(paths.map((p) => [p, 2]));
  },
};

async function waitFor(cond: () => boolean | Promise<boolean>, what: string, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

d('Onboarding Tour routes + generate job (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: GatedLLM;
  let app: FastifyInstance;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new GatedLLM();
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ filesAtRef: FILES, head: 'headsha222222222' }),
        repoIntel: intel as unknown as RepoIntel,
        llm: { openrouter: llm },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function newRepo(opts: { clonePath?: string | null; ws?: string } = {}): Promise<string> {
    const name = `shop${++seq}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: opts.ws ?? workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: opts.clonePath === undefined ? `/mock/clones/acme/${name}` : opts.clonePath,
      })
      .returning();
    return repo!.id;
  }

  async function view(repoId: string): Promise<OnboardingView> {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    return res.json() as OnboardingView;
  }

  async function generate(repoId: string): Promise<OnboardingGeneration> {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    return res.json() as OnboardingGeneration;
  }

  async function untilSettled(repoId: string): Promise<OnboardingView> {
    let v!: OnboardingView;
    await waitFor(async () => {
      v = await view(repoId);
      return v.generation !== null && v.generation.status !== 'running';
    }, 'the generation to finish');
    return v;
  }

  /** The generate job of `generationId` has finished (done or failed) in `jobs`. */
  async function jobFinished(generationId: string): Promise<boolean> {
    const rows = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.kind, 'onboarding-generate'));
    const row = rows.find((r) => (r.payload as { generationId?: string } | null)?.generationId === generationId);
    return row?.status === 'done' || row?.status === 'failed';
  }

  async function storedJson(repoId: string): Promise<unknown> {
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row?.json ?? null;
  }

  function reset() {
    llm.hold = false;
    llm.fail = null;
    llm.pending = [];
    llm.firstTasks = 'Add a test for `src/b.ts`.';
    intel.status = 'full';
  }

  it('GET on a fresh repo: empty view, and it creates no generation (AC-56, AC-32)', async () => {
    reset();
    const repoId = await newRepo();
    const before = llm.calls.length;
    const v = await view(repoId);
    expect(v).toMatchObject({ repo_id: repoId, tour: null, generation: null, clone_ready: true, indexing: false });
    await view(repoId);
    const rows = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(rows).toEqual([]);
    expect(llm.calls.length).toBe(before);
  });

  it('POST → 202 running; polling GET reaches done with an llm tour (AC-12, AC-17, AC-31)', async () => {
    reset();
    const repoId = await newRepo();
    const before = llm.calls.length;
    const gen = await generate(repoId);
    expect(gen.status).toBe('running');
    const v = await untilSettled(repoId);
    expect(v.generation).toMatchObject({ id: gen.id, status: 'done', outcome: 'stored' });
    expect(v.tour).toMatchObject({
      kind: 'llm',
      llm_calls: 1,
      commit_sha: INDEX_SHA,
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
    });
    expect(v.tour?.sections.critical_paths.entries[0]).toMatchObject({ root: 'src/server.ts', importers: 2 });
    expect(llm.calls.length).toBe(before + 1);
    expect(llm.calls.at(-1)).toMatchObject({ maxRetries: 0, transportRetries: 0, reasoning: 'off', maxTokens: 4000 });
  });

  it('two parallel POSTs → one 202 and one 409 (AC-14)', async () => {
    reset();
    llm.hold = true;
    const repoId = await newRepo();
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` }),
      app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    await waitFor(() => llm.pending.length === 1, 'the held LLM call');
    llm.release(0);
    const v = await untilSettled(repoId);
    expect(v.generation?.status).toBe('done');
  });

  it('the partial unique index allows only one running generation per repo (S4)', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.onboardingGenerations).values({ workspaceId, repoId, status: 'running' });
    await expect(
      pg.handle.db.insert(t.onboardingGenerations).values({ workspaceId, repoId, status: 'running' }),
    ).rejects.toThrow();
    // a finished one next to the running one is fine
    await pg.handle.db.insert(t.onboardingGenerations).values({ workspaceId, repoId, status: 'failed' });
  });

  it('a skeleton regeneration over a stored LLM tour keeps it: outcome kept_previous (AC-77, AC-16)', async () => {
    reset();
    const repoId = await newRepo();
    await generate(repoId);
    const first = await untilSettled(repoId);
    expect(first.tour?.kind).toBe('llm');

    llm.fail = new Error('502 upstream exploded');
    await generate(repoId);
    const second = await untilSettled(repoId);
    expect(second.generation).toMatchObject({ status: 'done', outcome: 'kept_previous', reason: 'llm_error' });
    expect(second.tour).toEqual(first.tour);
  });

  it('a skeleton over no stored tour is stored (AC-16)', async () => {
    reset();
    intel.status = 'failed';
    const repoId = await newRepo();
    await generate(repoId);
    const v = await untilSettled(repoId);
    expect(v.generation).toMatchObject({ status: 'done', outcome: 'stored' });
    expect(v.tour).toMatchObject({ kind: 'skeleton', skeleton_reason: 'index_failed', llm_calls: 0 });
  });

  it("A's row already failed (job timeout), B started, A's answer arrives → A discarded, tour untouched (AC-21, A11)", async () => {
    reset();
    const repoId = await newRepo();
    llm.hold = true;
    llm.firstTasks = 'A-TASKS';
    const a = await generate(repoId);
    await waitFor(() => llm.pending.length === 1, "A's held LLM call");

    // the runner gave up on A: its row is failed, as `job.done.catch` would leave it
    await pg.handle.db
      .update(t.onboardingGenerations)
      .set({ status: 'failed', detail: 'Job timed out', finishedAt: new Date() })
      .where(and(eq(t.onboardingGenerations.id, a.id), eq(t.onboardingGenerations.status, 'running')));

    llm.firstTasks = 'B-TASKS';
    const b = await generate(repoId);
    await waitFor(() => llm.pending.length === 2, "B's held LLM call");

    llm.release(0); // A completes late
    await waitFor(() => jobFinished(a.id), "A's job to finish");
    expect(await storedJson(repoId)).toBeNull();
    const [aRow] = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.id, a.id));
    expect(aRow).toMatchObject({ status: 'failed', outcome: null });

    llm.release(1);
    const v = await untilSettled(repoId);
    expect(v.generation).toMatchObject({ id: b.id, status: 'done', outcome: 'stored' });
    expect(v.tour?.sections.first_tasks.body_md).toContain('B-TASKS');
  });

  it('DELETE /repos/:id removes the stored tour and its generations (AC-22)', async () => {
    reset();
    const repoId = await newRepo();
    await generate(repoId);
    await untilSettled(repoId);
    expect(await storedJson(repoId)).not.toBeNull();
    const del = await app.inject({ method: 'DELETE', url: `/repos/${repoId}` });
    expect(del.statusCode).toBe(200);
    expect(await storedJson(repoId)).toBeNull();
    const gens = await pg.handle.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    expect(gens).toEqual([]);
  });

  it('removing the repo during a generation stores nothing (AC-23)', async () => {
    reset();
    const repoId = await newRepo();
    llm.hold = true;
    const gen = await generate(repoId);
    await waitFor(() => llm.pending.length === 1, 'the held LLM call');
    const del = await app.inject({ method: 'DELETE', url: `/repos/${repoId}` });
    expect(del.statusCode).toBe(200);
    llm.release(0);
    await waitFor(() => jobFinished(gen.id), 'the job to finish');
    expect(await storedJson(repoId)).toBeNull();
    const rows = await pg.handle.db.select().from(t.onboarding);
    expect(rows.find((r) => r.repoId === repoId)).toBeUndefined();
  });

  it('clone_path null → POST 409 clone_not_ready, GET says clone_ready false (AC-51)', async () => {
    reset();
    const repoId = await newRepo({ clonePath: null });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('clone_not_ready');
    expect((await view(repoId)).clone_ready).toBe(false);
  });

  it("another workspace's repo → 404 on GET and POST; unknown id → 404", async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await newRepo({ ws: other!.id });
    expect((await app.inject({ method: 'GET', url: `/repos/${foreign}/onboarding` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/repos/${foreign}/onboarding/generate` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/repos/00000000-0000-0000-0000-000000000000/onboarding' }))
        .statusCode,
    ).toBe(404);
  });
});
