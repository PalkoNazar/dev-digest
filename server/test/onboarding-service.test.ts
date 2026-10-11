import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIConnectionTimeoutError } from 'openai';
import {
  OnboardingTour,
  type FeatureModelChoice,
  type GitTreeEntry,
  type OnboardingGeneration,
  type RepoRef,
  type StructuredRequest,
  type StructuredResult,
} from '@devdigest/shared';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type { OnboardingRepo, OnboardingTarget } from '../src/modules/onboarding/ports.js';
import { TourDraft, type GenerateJobPayload } from '../src/modules/onboarding/types.js';
import {
  FILE_RANK_CHUNK,
  GENERATE_JOB_KIND,
  LLM_TIMEOUT_MS,
} from '../src/modules/onboarding/constants.js';
import type {
  BlastResult,
  FileRankRow,
  IndexState,
  RepoMapResult,
  SymbolRow,
} from '../src/modules/repo-intel/types.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError, ConflictError, NotFoundError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';

/**
 * SPEC-02 (L05 Onboarding Tour) — plan S11 (`OnboardingService`), amendments A3, A4,
 * A6, A10. Hand-written fakes of the module's ports; no DB, no container, no keys.
 *
 * Interface this file fixes (plan S10 `ports.ts`):
 * - `OnboardingDeps { repo, intel, git, jobs, llm, systemPrompt, countTokens, indexEnabled, log, now? }`
 * - `repo.completeGeneration(ws, id, tour)` → `'stored' | 'kept_previous' | 'discarded'`
 * - `repo.failGeneration(ws, id, detail)`; an interrupted run is `failed` + `'Interrupted'` (A4)
 * - `git` = `{ listTree(repo, ref), showFile(repo, ref, path), currentHead(repo) }`
 * - the LLM race uses the global `setTimeout` (driven here by `vi.useFakeTimers`)
 */

const WS = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '22222222-2222-4222-8222-222222222222';
const GEN_ID = '33333333-3333-4333-8333-333333333333';
const PAYLOAD: GenerateJobPayload = { workspaceId: WS, repoId: REPO_ID, generationId: GEN_ID };
const NOW = new Date('2026-10-11T12:00:00.000Z');
const FINISHED = 'onboarding tour generation finished';

const INDEX_SHA = 'idxsha1111111111';
const HEAD_SHA = 'headsha222222222';
const SYSTEM = 'SYSTEM-PROMPT-MARKER: write the onboarding tour.';
const README_MARKER = 'README-MARKER-7f3a';
const FAKE_SECRET = 'sk-or-v1-FAKEFAKEFAKE0000';
const MODEL: FeatureModelChoice = { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' };

const TARGET: OnboardingTarget = {
  id: REPO_ID,
  owner: 'acme',
  name: 'shop',
  fullName: 'acme/shop',
  clonePath: '/clones/acme/shop',
};

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'shop',
    scripts: { dev: 'tsx watch src/server.ts', build: 'tsc' },
    dependencies: { fastify: '^5.0.0' },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9.0',
  '.env.example': 'PORT=3000',
  'docker-compose.yml': 'services:\n  postgres:\n    image: postgres:16\n',
  'README.md': `# Shop\n\n${README_MARKER} — the demo shop service.`,
  'src/a.ts': 'export const a = 1;',
  'src/b.ts': 'export const b = 2;',
  'src/c.ts': 'export const c = 3;',
  'src/server.ts': 'export function start() {}',
  'src/db/client.ts': 'export const db = {};',
  'scripts/x.ts': 'console.log(1);',
  'server/package.json': JSON.stringify({ scripts: { dev: 'node index.js' } }),
  'server/index.js': 'module.exports = {};',
};
/** The candidates `getFileRank` knows — i.e. the indexed set (AC-45). */
const INDEXED = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/server.ts'];

const DRAFT: TourDraft = {
  architecture: { body_md: 'A Fastify API; it starts in `src/server.ts`.', diagram: null },
  critical_paths: {
    body_md: null,
    descriptions: [{ root: 'src/server.ts', description: 'Boots the HTTP server.' }],
  },
  run_locally: { body_md: null, steps: [{ command: 'pnpm install' }, { command: 'pnpm dev' }] },
  reading_path: { body_md: null, reasons: [{ path: 'src/a.ts', reason: 'The core logic.' }] },
  first_tasks: { body_md: 'Add a unit test for `src/b.ts`.' },
};

function state(over: Partial<IndexState> = {}): IndexState {
  return {
    repoId: REPO_ID,
    status: 'full',
    filesIndexed: 4,
    filesSkipped: 0,
    durationMs: 10,
    lastIndexedSha: INDEX_SHA,
    indexerVersion: 1,
    updatedAt: NOW,
    filesLeftOut: 0,
    ...over,
  };
}

function generation(over: Partial<OnboardingGeneration> = {}): OnboardingGeneration {
  return {
    id: 'gen-old',
    status: 'running',
    outcome: null,
    reason: null,
    detail: null,
    started_at: NOW.toISOString(),
    finished_at: null,
    ...over,
  };
}

function minutesAgo(m: number): string {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

/** In-memory OnboardingRepo; `ops` records the order of the writes. */
class FakeRepo implements OnboardingRepo {
  target: OnboardingTarget | null = { ...TARGET };
  model: FeatureModelChoice = MODEL;
  latest: OnboardingGeneration | null = null;
  tour: OnboardingTour | null = null;
  indexing = false;
  completeResult: 'stored' | 'kept_previous' | 'discarded' = 'stored';
  ops: string[] = [];
  created: OnboardingGeneration[] = [];
  failed: { id: string; detail: string }[] = [];
  completed: { id: string; tour: OnboardingTour }[] = [];
  private seq = 0;

  async findRepo(ws: string, repoId: string) {
    return ws === WS && repoId === REPO_ID ? this.target : null;
  }
  async featureModel() {
    return this.model;
  }
  async latestGeneration() {
    return this.latest;
  }
  async createGeneration() {
    this.ops.push('create');
    const g = generation({ id: `gen-${++this.seq}` });
    this.created.push(g);
    this.latest = g;
    return g;
  }
  async failGeneration(_ws: string, id: string, detail: string) {
    this.ops.push(`fail:${id}:${detail}`);
    this.failed.push({ id, detail });
  }
  async completeGeneration(_ws: string, id: string, tour: OnboardingTour) {
    this.ops.push(`complete:${id}`);
    this.completed.push({ id, tour });
    return this.completeResult;
  }
  async getTour() {
    return this.tour;
  }
  async indexingInProgress() {
    return this.indexing;
  }
}

/** The repo-intel facade subset; every call is recorded by name. */
class FakeIntel {
  calls: { method: string; args: unknown[] }[] = [];
  state: IndexState = state();
  ranked = ['src/server.ts', 'src/a.ts', 'src/a.test.ts', 'src/b.ts'];
  chains: string[][] = [['src/server.ts', 'src/a.ts', 'src/db/client.ts']];
  /** Returned whatever the index status — the service decides null-ness (reviewer note 3). */
  importers: Record<string, number> = { 'src/server.ts': 4 };
  indexed = new Set(INDEXED);

  private rec(method: string, args: unknown[]) {
    this.calls.push({ method, args });
  }
  methods(): string[] {
    return this.calls.map((c) => c.method);
  }
  async getIndexState(repoId: string) {
    this.rec('getIndexState', [repoId]);
    return this.state;
  }
  async getTopFilesByRank(repoId: string, n: number, opts?: unknown) {
    this.rec('getTopFilesByRank', [repoId, n, opts]);
    return this.ranked;
  }
  async getCriticalPaths(repoId: string) {
    this.rec('getCriticalPaths', [repoId]);
    return this.chains;
  }
  async getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    this.rec('getFileRank', [repoId, paths]);
    return paths.filter((p) => this.indexed.has(p)).map((path) => ({ path, percentile: 0.5 }));
  }
  async getBlastRadius(repoId: string, files: string[]): Promise<BlastResult> {
    this.rec('getBlastRadius', [repoId, files]);
    return {
      changedSymbols: [],
      callers: [{ file: 'src/server.ts', symbol: 'start', viaSymbol: 'a', line: 1, rank: 0.9 }],
      impactedEndpoints: ['GET /health'],
      factsByFile: { 'src/server.ts': { endpoints: ['GET /health'], crons: [] } },
    };
  }
  async getRepoMap(repoId: string, budget?: number): Promise<RepoMapResult> {
    this.rec('getRepoMap', [repoId, budget]);
    return { text: 'src/server.ts\n  function start()', tokens: 8, cached: true };
  }
  async getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    this.rec('getSymbolsInFiles', [repoId, paths]);
    return [
      {
        file: 'src/server.ts',
        name: 'start',
        kind: 'function',
        exported: true,
        startLine: 1,
        endLine: 1,
        signature: 'function start(): void',
      },
    ];
  }
  async getImporterCounts(repoId: string, paths: string[]) {
    this.rec('getImporterCounts', [repoId, paths]);
    return Object.fromEntries(paths.map((p) => [p, this.importers[p] ?? 0]));
  }
}

/** Git objects by ref: `trees[ref]` = the paths listed at that ref (null = not readable). */
class FakeGit {
  trees: Record<string, string[] | null> = {};
  files: Record<string, string> = { ...FILES };
  head = HEAD_SHA;
  listed: string[] = [];
  shown: { ref: string; path: string }[] = [];
  listTreeError: Error | null = null;
  /**
   * Refs whose `ls-tree` REJECTS, like the real adapter (`simple-git.ts` listTree):
   * it returns null only without a clone or for an unsafe ref; a missing object
   * (pruned commit, empty repo's HEAD) is a git error that propagates.
   */
  listTreeRejects: Record<string, Error> = {};

  constructor(paths: string[] = Object.keys(FILES)) {
    this.trees[INDEX_SHA] = paths;
    this.trees.HEAD = paths;
    this.trees[HEAD_SHA] = paths;
  }
  async listTree(_repo: RepoRef, ref: string): Promise<GitTreeEntry[] | null> {
    this.listed.push(ref);
    if (this.listTreeError) throw this.listTreeError;
    const rejection = this.listTreeRejects[ref];
    if (rejection) throw rejection;
    const paths = this.trees[ref];
    if (!paths) return null;
    return paths.map((path) => ({ path, mode: '100644', size: this.files[path]?.length ?? 10 }));
  }
  async showFile(_repo: RepoRef, ref: string, path: string): Promise<string | null> {
    this.shown.push({ ref, path });
    return this.files[path] ?? null;
  }
  async currentHead(): Promise<string> {
    return this.head;
  }
}

class FakeLog {
  lines: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  private push(level: string, obj: unknown, msg?: string) {
    this.lines.push({ level, obj: (obj ?? {}) as Record<string, unknown>, msg: msg ?? '' });
  }
  info(obj: unknown, msg?: string) {
    this.push('info', obj, msg);
  }
  warn(obj: unknown, msg?: string) {
    this.push('warn', obj, msg);
  }
  error(obj: unknown, msg?: string) {
    this.push('error', obj, msg);
  }
  debug(obj: unknown, msg?: string) {
    this.push('debug', obj, msg);
  }
  finished() {
    return this.lines.filter((l) => l.msg === FINISHED);
  }
  text() {
    return JSON.stringify(this.lines);
  }
}

/** A MockLLMProvider whose structured answer is scripted (reject, hang, resolve late). */
class ScriptedLLM extends MockLLMProvider {
  constructor(private readonly script: () => Promise<StructuredResult<unknown>>) {
    super('openai');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return (await this.script()) as StructuredResult<T>;
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function structuredCalls(llm: MockLLMProvider) {
  return llm.calls.filter((c) => c.method === 'completeStructured');
}

interface BuildOpts {
  llm?: MockLLMProvider;
  noKey?: boolean;
  indexEnabled?: boolean;
  countTokens?: (text: string) => number;
  git?: FakeGit;
  enqueue?: (ws: string, kind: string, payload: unknown) => Promise<{ id: string; done: Promise<void> }>;
}

function build(opts: BuildOpts = {}) {
  const repo = new FakeRepo();
  const intel = new FakeIntel();
  const git = opts.git ?? new FakeGit();
  const log = new FakeLog();
  const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { OnboardingTourDraft: DRAFT } });
  const providers: string[] = [];
  const enqueued: { ws: string; kind: string; payload: unknown }[] = [];
  const service = new OnboardingService({
    repo,
    intel,
    git,
    jobs: {
      enqueue:
        opts.enqueue ??
        (async (ws, kind, payload) => {
          enqueued.push({ ws, kind, payload });
          // the job never finishes here: start() must answer before it does (AC-12)
          return { id: 'job-1', done: new Promise<void>(() => undefined) };
        }),
    },
    llm: async (provider) => {
      providers.push(provider);
      if (opts.noKey) throw new ConfigError(`No API key configured for ${provider}`);
      return llm;
    },
    systemPrompt: async () => SYSTEM,
    countTokens: opts.countTokens ?? ((t: string) => Math.ceil(t.length / 4)),
    indexEnabled: opts.indexEnabled ?? true,
    log,
    now: () => NOW,
  });
  return { service, repo, intel, git, log, llm, providers, enqueued };
}

function storedTour(repo: FakeRepo): OnboardingTour {
  expect(repo.completed).toHaveLength(1);
  return repo.completed[0]!.tour;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------

describe('OnboardingService.start', () => {
  it('creates a running generation, enqueues one job and answers before it finishes (AC-12)', async () => {
    const { service, repo, enqueued } = build();
    const gen = await service.start(WS, REPO_ID);
    expect(gen).toMatchObject({ id: 'gen-1', status: 'running' });
    expect(enqueued).toEqual([
      { ws: WS, kind: GENERATE_JOB_KIND, payload: { workspaceId: WS, repoId: REPO_ID, generationId: 'gen-1' } },
    ]);
    expect(repo.ops).toEqual(['create']);
  });

  it('unknown repo → NotFoundError, nothing created', async () => {
    const { service, repo, enqueued } = build();
    await expect(service.start(WS, '99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.created).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });

  it('no clone (clonePath null) → 409 clone_not_ready, nothing created (AC-51)', async () => {
    const { service, repo, enqueued } = build();
    repo.target = { ...TARGET, clonePath: null };
    const err = await service.start(WS, REPO_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'clone_not_ready', statusCode: 409 });
    expect(repo.created).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });

  it('a clone whose HEAD tree is unreadable → 409 clone_not_ready (AC-51)', async () => {
    const git = new FakeGit();
    git.trees.HEAD = null;
    const { service, repo } = build({ git });
    await expect(service.start(WS, REPO_ID)).rejects.toMatchObject({ code: 'clone_not_ready', statusCode: 409 });
    expect(repo.created).toHaveLength(0);
  });

  it('a clone whose `ls-tree HEAD` rejects (empty repo, no commit) → 409 clone_not_ready, nothing created (AC-51, B2)', async () => {
    const git = new FakeGit();
    git.listTreeRejects.HEAD = new Error("fatal: Not a valid object name HEAD");
    const { service, repo, enqueued } = build({ git });
    const err = await service.start(WS, REPO_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'clone_not_ready', statusCode: 409 });
    expect(repo.created).toHaveLength(0);
    expect(repo.ops).toEqual([]);
    expect(enqueued).toHaveLength(0);
  });

  it('a fresh running generation (14 min) → ConflictError, no second generation (AC-14)', async () => {
    const { service, repo, enqueued } = build();
    repo.latest = generation({ started_at: minutesAgo(14) });
    await expect(service.start(WS, REPO_ID)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.ops).toEqual([]);
    expect(enqueued).toHaveLength(0);
  });

  it('a stale running generation (16 min) is failed as Interrupted BEFORE the new row is created (AC-18/19, A4)', async () => {
    const { service, repo, enqueued } = build();
    repo.latest = generation({ id: 'gen-old', started_at: minutesAgo(16) });
    const gen = await service.start(WS, REPO_ID);
    expect(gen.status).toBe('running');
    // the partial unique index allows one running row: the old one must be closed first
    expect(repo.ops).toEqual(['fail:gen-old:Interrupted', 'create']);
    expect(enqueued).toHaveLength(1);
  });

  it('an already-interrupted latest generation (failed + Interrupted) is accepted without touching it (AC-19)', async () => {
    const { service, repo, enqueued } = build();
    repo.latest = generation({ id: 'gen-old', status: 'failed', detail: 'Interrupted', started_at: minutesAgo(30) });
    await service.start(WS, REPO_ID);
    expect(repo.ops).toEqual(['create']);
    expect(enqueued).toHaveLength(1);
  });

  it('an enqueue error fails the new generation and is rethrown', async () => {
    const { service, repo } = build({
      enqueue: async () => {
        throw new Error('queue down');
      },
    });
    await expect(service.start(WS, REPO_ID)).rejects.toThrow('queue down');
    expect(repo.failed.map((f) => f.id)).toEqual(['gen-1']);
  });

  it('a job that gives up (timeout) fails the generation with a redacted message (AC-49)', async () => {
    const { service, repo } = build({
      enqueue: async () => ({ id: 'job-1', done: Promise.reject(new Error(`job timed out; key ${FAKE_SECRET}`)) }),
    });
    await service.start(WS, REPO_ID);
    await flush();
    expect(repo.failed).toHaveLength(1);
    expect(repo.failed[0]!.id).toBe('gen-1');
    expect(repo.failed[0]!.detail).not.toContain(FAKE_SECRET);
    expect(repo.failed[0]!.detail).toContain('[redacted]');
  });
});

// ---------------------------------------------------------------------------

describe('OnboardingService.view', () => {
  it('reads only: no LLM, no tree, no fact collection (AC-32)', async () => {
    const { service, repo, intel, git, providers, llm } = build();
    repo.tour = null;
    repo.latest = generation({ status: 'done', outcome: 'stored', finished_at: NOW.toISOString() });
    const view = await service.view(WS, REPO_ID);
    expect(view).toMatchObject({
      repo_id: REPO_ID,
      tour: null,
      generation: { status: 'done', outcome: 'stored' },
      clone_ready: true,
      indexing: false,
      current_commit_sha: INDEX_SHA,
    });
    expect(providers).toEqual([]);
    expect(llm.calls).toEqual([]);
    expect(git.listed).toEqual([]);
    expect(git.shown).toEqual([]);
    expect(new Set(intel.methods())).toEqual(new Set(['getIndexState']));
  });

  it('reports clone_ready false and indexing true from the repo (AC-51/52 data)', async () => {
    const { service, repo } = build();
    repo.target = { ...TARGET, clonePath: null };
    repo.indexing = true;
    const view = await service.view(WS, REPO_ID);
    expect(view.clone_ready).toBe(false);
    expect(view.indexing).toBe(true);
  });

  it('current_commit_sha is null when the repo was never indexed', async () => {
    const { service, intel } = build();
    intel.state = state({ status: 'degraded', lastIndexedSha: '', degraded: true, degradedReason: 'no_data' });
    expect((await service.view(WS, REPO_ID)).current_commit_sha).toBeNull();
  });

  it('a running generation older than 15 min is reported interrupted (AC-18, A4)', async () => {
    const { service, repo } = build();
    repo.latest = generation({ started_at: minutesAgo(16) });
    expect((await service.view(WS, REPO_ID)).generation?.status).toBe('interrupted');
  });

  it('a running generation of 14 min stays running', async () => {
    const { service, repo } = build();
    repo.latest = generation({ started_at: minutesAgo(14) });
    expect((await service.view(WS, REPO_ID)).generation?.status).toBe('running');
  });

  it("a failed generation with detail 'Interrupted' is reported interrupted (A4)", async () => {
    const { service, repo } = build();
    repo.latest = generation({ status: 'failed', detail: 'Interrupted', started_at: minutesAgo(30) });
    expect((await service.view(WS, REPO_ID)).generation?.status).toBe('interrupted');
  });

  it('a failed generation with another detail stays failed', async () => {
    const { service, repo } = build();
    repo.latest = generation({ status: 'failed', detail: 'git exploded', started_at: minutesAgo(30) });
    expect((await service.view(WS, REPO_ID)).generation?.status).toBe('failed');
  });

  it('unknown repo → NotFoundError', async () => {
    const { service } = build();
    await expect(service.view(WS, '99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------

describe('OnboardingService.run — the LLM path', () => {
  it('full index + key → exactly one call with every one-call field and the feature model (AC-31, AC-87, AC-88, A6)', async () => {
    const { service, llm, providers } = build();
    await service.run(PAYLOAD);
    expect(providers).toEqual(['openrouter']);
    const calls = structuredCalls(llm);
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      schemaName: 'OnboardingTourDraft',
      temperature: 0.2,
      maxTokens: 4000,
      maxRetries: 0,
      transportRetries: 0,
      reasoning: 'off',
      timeoutMs: 125_000,
    });
    expect(req.schema).toBe(TourDraft);
    // A6: the system prompt is awaited, not stringified as a Promise
    const system = req.messages.find((m) => m.role === 'system')!;
    expect(system.content.startsWith(SYSTEM)).toBe(true);
    expect(JSON.stringify(req.messages)).not.toContain('[object Promise]');
    // AC-24: facts from the clone reach the prompt (README read from git objects at the commit)
    expect(JSON.stringify(req.messages)).toContain(README_MARKER);
  });

  it('stores an llm tour with the model, tokens, cost, snapshot and indexed commit (AC-35, AC-36, AC-54, AC-68)', async () => {
    const { service, repo, git } = build();
    await service.run(PAYLOAD);
    const tour = storedTour(repo);
    expect(repo.completed[0]!.id).toBe(GEN_ID);
    expect(OnboardingTour.safeParse(tour).success).toBe(true);
    expect(tour).toMatchObject({
      kind: 'llm',
      skeleton_reason: null,
      languages_indexed: true,
      commit_sha: INDEX_SHA,
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      llm_calls: 1,
      index: { status: 'full', reason: null, files_indexed: 4, files_total: 4 },
    });
    expect(tour.sections.first_tasks.body_md).toContain('Add a unit test');
    // the tree and the files are read at the indexed commit
    expect(git.listed).toContain(INDEX_SHA);
    expect(git.shown.length).toBeGreaterThan(0);
    expect(git.shown.every((s) => s.ref === INDEX_SHA)).toBe(true);
  });

  it('critical entries carry the importer counts and the LLM description (AC-70, AC-76)', async () => {
    const { service, repo, intel } = build();
    await service.run(PAYLOAD);
    expect(storedTour(repo).sections.critical_paths.entries).toEqual([
      {
        root: 'src/server.ts',
        chain: ['src/a.ts', 'src/db/client.ts'],
        importers: 4,
        description: 'Boots the HTTP server.',
      },
    ]);
    const importerCall = intel.calls.find((c) => c.method === 'getImporterCounts');
    expect(importerCall?.args[1]).toEqual(['src/server.ts']);
  });

  it('folder counts come from the getFileRank rows (AC-45)', async () => {
    const { service, repo } = build();
    await service.run(PAYLOAD);
    const folders = storedTour(repo).sections.architecture.folders;
    expect(folders).toContainEqual({ path: 'src', files: 4 });
    expect(folders).toContainEqual({ path: 'server', files: 0 });
    expect(folders).toContainEqual({ path: 'scripts', files: 0 });
  });

  it('the reading path is the ranked, filtered order — whatever the LLM says (AC-25, AC-28)', async () => {
    const { service, repo } = build();
    await service.run(PAYLOAD);
    const items = storedTour(repo).sections.reading_path.items;
    expect(items.map((i) => i.path)).toEqual(['src/server.ts', 'src/a.ts', 'src/b.ts']);
    expect(items.find((i) => i.path === 'src/a.ts')?.reason).toBe('The core logic.');
  });

  it('an ungrounded LLM path is counted in removed_ungrounded (AC-57/58)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        OnboardingTourDraft: {
          ...DRAFT,
          reading_path: { body_md: null, reasons: [{ path: 'src/fake.ts', reason: 'Invented.' }] },
        },
      },
    });
    const { service, repo } = build({ llm });
    await service.run(PAYLOAD);
    expect(storedTour(repo).removed_ungrounded).toBe(1);
  });

  it('getFileRank is asked in chunks of at most 1,000 paths', async () => {
    const many = Array.from({ length: 2_500 }, (_, i) => `src/gen${i}.ts`);
    const git = new FakeGit([...Object.keys(FILES), ...many]);
    const { service, intel } = build({ git });
    await service.run(PAYLOAD);
    const chunks = intel.calls.filter((c) => c.method === 'getFileRank').map((c) => c.args[1] as string[]);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((paths) => paths.length <= FILE_RANK_CHUNK)).toBe(true);
    const asked = new Set(chunks.flat());
    expect(many.every((p) => asked.has(p))).toBe(true);
  });

  it('a partial index → one call, a partial snapshot with files_total = indexed + left out (AC-44, AC-68)', async () => {
    const { service, repo, intel, llm } = build();
    intel.state = state({ status: 'partial', reason: 'index_partial', degradedReason: 'index_partial', filesIndexed: 4, filesLeftOut: 3 });
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(1);
    const tour = storedTour(repo);
    expect(tour.kind).toBe('llm');
    expect(tour.index).toEqual({ status: 'partial', reason: 'index_partial', files_indexed: 4, files_total: 7 });
    expect(tour.sections.critical_paths.entries[0]?.importers).toBe(4);
  });

  it('a Python-only tree on a degraded index → one call with empty reading and critical paths (AC-39)', async () => {
    const git = new FakeGit(['app.py', 'lib/util.py', 'requirements.txt', 'README.md']);
    git.files = { 'app.py': 'print(1)', 'lib/util.py': 'x = 1', 'requirements.txt': 'flask', 'README.md': '# Py' };
    const { service, repo, intel, llm } = build({ git });
    intel.state = state({ status: 'degraded', degraded: true, degradedReason: 'no_data', reason: 'no_data', filesIndexed: 0 });
    intel.ranked = ['app.py'];
    intel.chains = [['app.py', 'lib/util.py']];
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(1);
    const tour = storedTour(repo);
    expect(tour).toMatchObject({ kind: 'llm', languages_indexed: false, llm_calls: 1 });
    expect(tour.sections.reading_path.items).toEqual([]);
    expect(tour.sections.critical_paths.entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('OnboardingService.run — commit and tree (AC-54, A10)', () => {
  it('commit_sha is the indexed SHA, not HEAD', async () => {
    const { service, repo } = build();
    await service.run(PAYLOAD);
    expect(storedTour(repo).commit_sha).toBe(INDEX_SHA);
  });

  it('when the indexed commit is unreadable, the tree falls back to HEAD and commit_sha is the SHA listed', async () => {
    const git = new FakeGit();
    git.trees[INDEX_SHA] = null;
    const { service, repo } = build({ git });
    await service.run(PAYLOAD);
    expect(git.listed).toContain(INDEX_SHA);
    expect(storedTour(repo).commit_sha).toBe(HEAD_SHA);
  });

  it('when `ls-tree <indexed sha>` REJECTS (commit pruned from the clone), the tree falls back to HEAD (A10, B1)', async () => {
    const git = new FakeGit();
    git.listTreeRejects[INDEX_SHA] = new Error(`fatal: not a tree object: ${INDEX_SHA}`);
    const { service, repo, log } = build({ git });
    await expect(service.run(PAYLOAD)).resolves.toBeUndefined();
    expect(git.listed).toEqual([INDEX_SHA, 'HEAD']);
    expect(repo.failed).toEqual([]);
    expect(storedTour(repo).commit_sha).toBe(HEAD_SHA);
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj.outcome).toBe('stored');
  });

  it('when both the indexed sha and HEAD reject → generation failed with a redacted detail, run resolves, one finished line (A10, B1, AC-49)', async () => {
    const git = new FakeGit();
    git.listTreeRejects[INDEX_SHA] = new Error(`fatal: not a tree object, token ${FAKE_SECRET}`);
    git.listTreeRejects.HEAD = new Error(`fatal: Not a valid object name HEAD, token ${FAKE_SECRET}`);
    const { service, repo, log } = build({ git });
    await expect(service.run(PAYLOAD)).resolves.toBeUndefined();
    // the fallback was tried before giving up
    expect(git.listed).toEqual([INDEX_SHA, 'HEAD']);
    expect(repo.completed).toEqual([]);
    expect(repo.failed).toHaveLength(1);
    expect(repo.failed[0]!.id).toBe(GEN_ID);
    expect(repo.failed[0]!.detail).not.toContain(FAKE_SECRET);
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj).toMatchObject({ outcome: 'failed', llm_calls: 0 });
    expect(log.text()).not.toContain(FAKE_SECRET);
  });

  it('a never-indexed repo uses the current HEAD as the commit', async () => {
    const { service, repo, intel } = build();
    intel.state = state({ status: 'degraded', lastIndexedSha: '', degraded: true, degradedReason: 'no_data', reason: 'no_data' });
    await service.run(PAYLOAD);
    expect(storedTour(repo).commit_sha).toBe(HEAD_SHA);
  });
});

// ---------------------------------------------------------------------------

describe('OnboardingService.run — skeleton fallbacks', () => {
  it.each([
    {
      name: 'degraded',
      st: { status: 'degraded' as const, degraded: true, degradedReason: 'no_data' as const, reason: 'no_data' },
      enabled: true,
      reason: 'index_degraded',
      snapshot: 'degraded',
    },
    {
      name: 'failed',
      st: { status: 'failed' as const, reason: 'index_failed' },
      enabled: true,
      reason: 'index_failed',
      snapshot: 'failed',
    },
    { name: 'off', st: {}, enabled: false, reason: 'index_off', snapshot: 'off' },
  ])('index $name → skeleton $reason with 0 LLM calls, importers null (AC-75, AC-68, reviewer note 3)', async ({ st, enabled, reason, snapshot }) => {
    const { service, repo, intel, llm, log } = build({ indexEnabled: enabled });
    intel.state = state(st);
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(0);
    const tour = storedTour(repo);
    expect(OnboardingTour.safeParse(tour).success).toBe(true);
    expect(tour).toMatchObject({
      kind: 'skeleton',
      skeleton_reason: reason,
      llm_calls: 0,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
    });
    expect(tour.index.status).toBe(snapshot);
    // the facade still returned counts: null-ness comes from the index state, never 0
    expect(tour.sections.critical_paths.entries.every((e) => e.importers === null)).toBe(true);
    expect(tour.sections.first_tasks.body_md).toBeNull();
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj.llm_calls).toBe(0);
  });

  it('no LLM key → skeleton no_llm_key with 0 calls (AC-41)', async () => {
    const { service, repo, llm, log, providers } = build({ noKey: true });
    await service.run(PAYLOAD);
    expect(providers).toEqual(['openrouter']);
    expect(structuredCalls(llm)).toHaveLength(0);
    expect(storedTour(repo)).toMatchObject({ kind: 'skeleton', skeleton_reason: 'no_llm_key', llm_calls: 0 });
    expect(log.finished()[0]!.obj.llm_calls).toBe(0);
  });

  it('a provider error echoing a key → llm_error, redacted detail and log, no second call (AC-42, AC-49, AC-88)', async () => {
    const llm = new ScriptedLLM(async () => {
      throw new Error(`401 Incorrect API key provided: ${FAKE_SECRET}`);
    });
    const { service, repo, log } = build({ llm });
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(1);
    const tour = storedTour(repo);
    expect(tour).toMatchObject({ kind: 'skeleton', skeleton_reason: 'llm_error' });
    expect(tour.reason_detail).toContain('[redacted]');
    expect(JSON.stringify(tour)).not.toContain(FAKE_SECRET);
    expect(log.text()).not.toContain(FAKE_SECRET);
  });

  it.each([
    { name: 'OpenRouter call budget', err: () => new Error('OpenRouter call for OnboardingTourDraft timed out after 125000ms (attempt 1)'), reason: 'llm_timeout' },
    { name: 'withTimeout TimeoutError', err: () => new TimeoutError(125_000), reason: 'llm_timeout' },
    { name: 'a TimeoutError by name only', err: () => Object.assign(new Error('signal aborted'), { name: 'TimeoutError' }), reason: 'llm_timeout' },
    { name: 'OpenAI SDK APIConnectionTimeoutError', err: () => new APIConnectionTimeoutError(), reason: 'llm_timeout' },
    { name: 'OpenRouter schema miss', err: () => new Error('OpenRouter structured output failed schema validation for OnboardingTourDraft — first_tasks: Required'), reason: 'invalid_output' },
    { name: 'OpenAI schema miss', err: () => new Error('OpenAI structured output failed schema validation'), reason: 'invalid_output' },
    { name: 'a 429', err: () => new Error('429 Rate limit reached'), reason: 'llm_error' },
  ])('classifyLlmError: $name → $reason, whole-tour skeleton (A3, AC-20, AC-43)', async ({ err, reason }) => {
    const llm = new ScriptedLLM(async () => {
      throw err();
    });
    const { service, repo } = build({ llm });
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(1);
    const tour = storedTour(repo);
    expect(tour).toMatchObject({ kind: 'skeleton', skeleton_reason: reason });
    // whole tour from the skeleton: no LLM text survives
    expect(tour.sections.first_tasks.body_md).toBeNull();
    expect(tour.sections.run_locally.source).toBe('deterministic');
  });

  it('input over 12,000 tokens (never-cut parts too big) → no LLM call, skeleton llm_error with an honest detail (AC-33, reviewer note 4)', async () => {
    const { service, repo, llm, log } = build({ countTokens: () => 13_000 });
    await service.run(PAYLOAD);
    expect(structuredCalls(llm)).toHaveLength(0);
    const tour = storedTour(repo);
    expect(tour).toMatchObject({ kind: 'skeleton', skeleton_reason: 'llm_error', llm_calls: 0 });
    expect(tour.reason_detail).toMatch(/token/i);
    expect(log.finished()[0]!.obj.llm_calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('OnboardingService.run — the 120 s timeout (AC-20, AC-21)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['resolves', 'rejects'] as const)(
    'no answer within 120 s → skeleton llm_timeout; a late answer that %s is ignored',
    async (late) => {
      const answer = deferred<StructuredResult<unknown>>();
      const called = deferred<void>();
      const llm = new ScriptedLLM(() => {
        called.resolve();
        return answer.promise;
      });
      const { service, repo, log } = build({ llm });
      let settled = false;
      const run = service.run(PAYLOAD).then(() => {
        settled = true;
      });
      await called.promise;

      await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS - 1_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      await run;

      expect(storedTour(repo)).toMatchObject({ kind: 'skeleton', skeleton_reason: 'llm_timeout' });

      if (late === 'resolves') {
        answer.resolve({
          data: DRAFT,
          model: MODEL.model,
          tokensIn: 100,
          tokensOut: 50,
          costUsd: 0.001,
          raw: '{}',
          attempts: 1,
        });
      } else {
        answer.reject(new Error('late failure'));
      }
      await vi.advanceTimersByTimeAsync(1_000);

      expect(repo.completed).toHaveLength(1);
      expect(structuredCalls(llm)).toHaveLength(1);
      expect(log.finished()).toHaveLength(1);
    },
  );
});

// ---------------------------------------------------------------------------

describe('OnboardingService.run — log line and terminal paths (AC-34, AC-23, Q5)', () => {
  it('writes exactly one finished line with every field and no repo text (AC-34)', async () => {
    const { service, log } = build();
    await service.run(PAYLOAD);
    const lines = log.finished();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe('info');
    expect(lines[0]!.obj).toMatchObject({
      repoId: REPO_ID,
      repo: 'acme/shop',
      llm_calls: 1,
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      kind: 'llm',
      outcome: 'stored',
    });
    const text = log.text();
    expect(text).not.toContain(README_MARKER);
    expect(text).not.toContain('SYSTEM-PROMPT-MARKER');
    expect(text).not.toContain('tsx watch');
    expect(text).not.toContain('Boots the HTTP server');
  });

  it('a kept_previous outcome is logged', async () => {
    const { service, repo, log, intel } = build();
    intel.state = state({ status: 'failed', reason: 'index_failed' });
    repo.completeResult = 'kept_previous';
    await service.run(PAYLOAD);
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj).toMatchObject({ outcome: 'kept_previous', kind: 'skeleton', reason: 'index_failed' });
  });

  it('a discarded generation (no longer running / repo removed) is only logged (AC-21, AC-23)', async () => {
    const { service, repo, log } = build();
    repo.completeResult = 'discarded';
    await expect(service.run(PAYLOAD)).resolves.toBeUndefined();
    expect(repo.failed).toEqual([]);
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj.outcome).toBe('discarded');
  });

  it('a non-LLM error fails the generation with a redacted message, never throws, logs once (Q5, AC-49)', async () => {
    const git = new FakeGit();
    git.listTreeError = new Error(`fatal: bad object, token ${FAKE_SECRET}`);
    const { service, repo, log } = build({ git });
    await expect(service.run(PAYLOAD)).resolves.toBeUndefined();
    expect(repo.completed).toEqual([]);
    expect(repo.failed).toHaveLength(1);
    expect(repo.failed[0]!.id).toBe(GEN_ID);
    expect(repo.failed[0]!.detail).not.toContain(FAKE_SECRET);
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj.llm_calls).toBe(0);
    expect(log.text()).not.toContain(FAKE_SECRET);
  });
});

