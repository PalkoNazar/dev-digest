import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  BlastRadius,
  FeatureModelChoice,
  IssueMeta,
  LLMProvider,
  PrBrief,
  PrIntentRecord,
  Provider,
  RepoRef,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { INJECTION_GUARD } from '@devdigest/reviewer-core';
import { BriefService } from '../src/modules/brief/service.js';
import type { BriefRepo } from '../src/modules/brief/ports.js';
import { BriefDraft, type BriefSnapshot, type StoredBrief } from '../src/modules/brief/types.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ContextRepo, DocSource, ProjectContextDeps } from '../src/modules/project-context/ports.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { makeBrief } from './helpers/brief-fixtures.js';

/**
 * SPEC-03 (L05 PR Brief), plan S8 — `BriefService` with hand-written fakes of its
 * ports (no DB, no container, no keys). AC-36–AC-40, AC-42, AC-43, AC-48, AC-49,
 * AC-57–AC-69, AC-79, AC-86–AC-88, AC-97, EC-1–EC-10, EC-20–EC-22, EC-27, EC-31.
 * Carry-overs: R1 B1 (repoDocs THROWS when git listTree rejects → the brief still
 * generates with a spec_docs note), R2 (caller lines reach the model; a blast-only
 * focus item on a listed caller line keeps its line).
 *
 * Shapes this file assumes (plan S8 `ports.ts` / `service.ts`):
 * - `new BriefService(deps)`, `deps = { repo: BriefRepo, intent: { getIntentRecord(ws, prId) →
 *   { record: PrIntentRecord } | null }, blast: { forPull(ws, prId) → BlastRadius },
 *   docs: { repoDocs(ws, repoId) → { attached, docs: {path,text}[], skipped, clone } },
 *   github(): Promise<{ getIssue, linkedIssueNumbers }>, llm(provider): Promise<LLMProvider>,
 *   systemPrompt(): Promise<string>, log: { info(obj, msg), warn(obj, msg) }, now?, timeoutMs? }`;
 * - `get(ws, prId)` / `generate(ws, prId)` → `PrBriefResponse` (`{ brief, stale }`);
 * - notes are `{ input, reason, ref? }` in `brief.inputs`; a failed issue read has
 *   `ref: '#<n>'`, an unreadable doc `ref: <path>`; a docs source that throws → `spec_docs`
 *   `unreadable`;
 * - a caller file is shown to the model as `path (lines a, b)` (sorted, deduped).
 */

const WS = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';
const PR_ID_2 = '44444444-4444-4444-8444-444444444444';
const REPO_ID = '33333333-3333-4333-8333-333333333333';
const HEAD = 'sha-head';
const NOW = new Date('2026-10-21T10:00:00.000Z');
const MODEL: FeatureModelChoice = { provider: 'openai', model: 'gpt-4.1' };
const LOG_MSG = 'pr brief: model call finished';

// Texts that must never reach a log line.
const TITLE_MARK = 'TITLE_MARK_rl';
const BODY_MARK = 'BODY_MARK_rl';
const ISSUE_MARK = 'ISSUE_MARK_rl';
const DOC_MARK = 'DOC_MARK_rl';
const RAW_MARK = 'RAW_MODEL_TEXT_MARK';
const SUMMARY_MARK = 'SUMMARY_MARK_rl';
const PATCH_BODY_MARK = 'PATCH_BODY_MARK_rl';
const SYSTEM = 'SYSTEM_MARK You write a short PR brief.';
const FAKE_KEY = 'sk-or-v1-FAKEFAKEFAKE1234';

const REPO: RepoRef = { owner: 'acme', name: 'shop' };

function snapshot(over: Partial<BriefSnapshot['pull']> = {}, files?: BriefSnapshot['files']): BriefSnapshot {
  return {
    pull: {
      id: PR_ID,
      repoId: REPO_ID,
      number: 7,
      title: `${TITLE_MARK} Rate-limit logins`,
      body: `${BODY_MARK} Closes #12.`,
      branch: 'feat/ratelimit',
      headSha: HEAD,
      detailHeadSha: HEAD,
      repo: REPO,
      ...over,
    },
    files: files ?? [
      { path: 'src/ratelimit.ts', additions: 20, deletions: 2, patch: `@@ -10,2 +12,7 @@\n-a\n+${PATCH_BODY_MARK}\n` },
      { path: 'src/login.ts', additions: 1, deletions: 0, patch: '@@ -39,0 +40 @@\n+x' },
      { path: 'assets/logo.png', additions: 0, deletions: 0, patch: null },
    ],
  };
}

const BLAST: BlastRadius = {
  changed_symbols: [{ name: 'limit', file: 'src/ratelimit.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'limit',
      file: 'src/ratelimit.ts',
      callers: [
        { name: 'handle', file: 'src/api/handler.ts', line: 40 },
        { name: 'handleAll', file: 'src/api/handler.ts', line: 12 },
        { name: 'handle', file: 'src/api/handler.ts', line: 40 },
      ],
      endpoints_affected: ['POST /login'],
      crons_affected: [],
    },
  ],
  summary: 'BLAST_SUMMARY 1 changed symbol reaches 3 callers',
  stats: { symbols: 1, callers: 3, endpoints: 1, crons: 0 },
  index_sha: HEAD,
};

function intentRecord(over: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    pr_id: PR_ID,
    summary: 'INTENT_SUMMARY Rate-limit the login route.',
    in_scope: ['login'],
    out_of_scope: ['signup'],
    head_sha: HEAD,
    confidence: 'medium',
    mode: 'llm',
    missing_context: false,
    context_gaps: [],
    sources_used: [],
    unresolved_refs: [],
    prompt_components: [],
    provider: 'openai',
    model: 'gpt-4.1',
    tokens_in: 10,
    tokens_out: 5,
    cost_usd: 0.0001,
    fallback_reason: null,
    updated_at: NOW.toISOString(),
    ...over,
  };
}

const DRAFT: BriefDraft = {
  summary: `${SUMMARY_MARK} Adds a per-user login rate limit.`,
  risks: [
    {
      kind: 'security',
      title: 'Spoofable limiter key',
      explanation: 'The key comes from X-Forwarded-For.',
      severity: 'high',
      file_refs: ['src/ratelimit.ts:12-18'],
    },
    { kind: 'correctness', title: 'Invented', explanation: 'e', severity: 'low', file_refs: ['src/invented.ts'] },
    { kind: 'impact', title: 'Caller breaks', explanation: 'e', severity: 'medium', file_refs: ['src/api/handler.ts'] },
  ],
  review_focus: [
    { file: 'src/ratelimit.ts', line: 14, reason: 'Key derivation' },
    { file: 'src/login.ts', line: 5, reason: 'Outside the hunk' },
    { file: 'src/api/handler.ts', line: 40, reason: 'Caller on a caller line' },
    { file: 'src/api/handler.ts', line: 41, reason: 'Caller, not a caller line' },
    { file: 'src/nope.ts', line: 1, reason: 'Invented' },
  ],
};

function result(over: Partial<StructuredResult<unknown>> = {}): StructuredResult<unknown> {
  return { data: DRAFT, model: MODEL.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001, raw: RAW_MARK, attempts: 1, ...over };
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

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// ---- fakes ----------------------------------------------------------------------

class FakeRepo implements BriefRepo {
  read: { headSha: string; brief: PrBrief | null } | null = { headSha: HEAD, brief: null };
  snap: BriefSnapshot | null = snapshot();
  model: FeatureModelChoice = MODEL;
  /** Head the save reports as current (null = the PR vanished). */
  saveHead: string | null = HEAD;
  saveError: unknown = null;
  saves: PrBrief[] = [];
  /** The exact objects `saveBrief` returned, to prove there is no read after the write. */
  returned: StoredBrief[] = [];
  calls: string[] = [];

  async readBrief() {
    this.calls.push('readBrief');
    return this.read;
  }
  async snapshot() {
    this.calls.push('snapshot');
    return this.snap;
  }
  async saveBrief(_ws: string, _prId: string, brief: PrBrief): Promise<StoredBrief | null> {
    this.calls.push('saveBrief');
    if (this.saveError) throw this.saveError;
    this.saves.push(brief);
    if (this.saveHead === null) return null;
    const stored = { brief: structuredClone(brief), headSha: this.saveHead };
    this.returned.push(stored);
    return stored;
  }
  async featureModel() {
    this.calls.push('featureModel');
    return this.model;
  }
}

class FakeIntent {
  record: PrIntentRecord | null = intentRecord();
  async getIntentRecord() {
    return this.record ? { record: this.record } : null;
  }
}

class FakeBlast {
  value: BlastRadius | Error = BLAST;
  calls = 0;
  async forPull(): Promise<BlastRadius> {
    this.calls += 1;
    if (this.value instanceof Error) throw this.value;
    return this.value;
  }
}

interface RepoDocsResult {
  attached: string[];
  docs: { path: string; text: string }[];
  skipped: string[];
  clone: boolean;
}

class FakeDocs {
  value: RepoDocsResult | Error = {
    attached: ['docs/limits.md'],
    docs: [{ path: 'docs/limits.md', text: `${DOC_MARK} Limits are per user.` }],
    skipped: [],
    clone: true,
  };
  async repoDocs(): Promise<RepoDocsResult> {
    if (this.value instanceof Error) throw this.value;
    return this.value;
  }
}

class FakeGitHub {
  linked: number[] = [];
  issues: Record<number, IssueMeta | Error> = {
    12: { number: 12, title: 'Login brute force', body: `${ISSUE_MARK} attackers retry`, state: 'open' },
  };
  getIssueCalls: number[] = [];
  linkedCalls = 0;
  async linkedIssueNumbers(_repo: RepoRef, _n: number): Promise<number[]> {
    this.linkedCalls += 1;
    return this.linked;
  }
  async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    this.getIssueCalls.push(n);
    const v = this.issues[n];
    if (v instanceof Error) throw v;
    if (!v) throw Object.assign(new Error('Not Found'), { status: 404 });
    return v;
  }
}

/** An LLM whose structured answer is scripted per call. */
class ScriptedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  calls: StructuredRequest<unknown>[] = [];
  /** Called once per `completeStructured`; default answers at once. */
  script: (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>> = async () => result();
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
    return (await this.script(req as StructuredRequest<unknown>)) as StructuredResult<T>;
  }
}

class FakeLog {
  lines: { level: 'info' | 'warn'; obj: Record<string, unknown>; msg: string }[] = [];
  info(obj: object, msg: string) {
    this.lines.push({ level: 'info', obj: obj as Record<string, unknown>, msg });
  }
  warn(obj: object, msg: string) {
    this.lines.push({ level: 'warn', obj: obj as Record<string, unknown>, msg });
  }
  finished() {
    return this.lines.filter((l) => l.msg === LOG_MSG);
  }
  refused() {
    return this.lines.filter((l) => l.obj.outcome === 'refused');
  }
  text() {
    return JSON.stringify(this.lines);
  }
}

interface BuildOpts {
  docs?: { repoDocs(ws: string, repoId: string): Promise<RepoDocsResult> };
  timeoutMs?: number;
  githubError?: Error;
  llmError?: Error;
}

function build(opts: BuildOpts = {}) {
  const repo = new FakeRepo();
  const intent = new FakeIntent();
  const blast = new FakeBlast();
  const docs = new FakeDocs();
  const gh = new FakeGitHub();
  const llm = new ScriptedLLM();
  const log = new FakeLog();
  const providers: string[] = [];
  let githubCalls = 0;
  const service = new BriefService({
    repo,
    intent,
    blast,
    docs: opts.docs ?? docs,
    github: async () => {
      githubCalls += 1;
      if (opts.githubError) throw opts.githubError;
      return gh;
    },
    llm: async (p: Provider) => {
      providers.push(p);
      if (opts.llmError) throw opts.llmError;
      return llm;
    },
    systemPrompt: async () => SYSTEM,
    log,
    now: () => new Date(NOW),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return { service, repo, intent, blast, docs, gh, llm, log, providers, githubCalls: () => githubCalls };
}

function userMessage(llm: ScriptedLLM, i = 0): string {
  return llm.calls[i]!.messages.find((m) => m.role === 'user')!.content;
}
function systemMessage(llm: ScriptedLLM, i = 0): string {
  return llm.calls[i]!.messages.find((m) => m.role === 'system')!.content;
}

async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error('expected a rejection');
}

// Every test: no unhandled rejection (late transport promises must be caught).
let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};
beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
});
afterEach(async () => {
  await tick(5);
  process.off('unhandledRejection', onUnhandled);
  expect(unhandled).toEqual([]);
});

// ---------------------------------------------------------------------------------

describe('BriefService.get — read only (AC-36–AC-39)', () => {
  it('no stored brief → { brief: null, stale: false }, no snapshot and no model (AC-37)', async () => {
    const { service, repo, llm, providers } = build();
    expect(await service.get(WS, PR_ID)).toEqual({ brief: null, stale: false });
    expect(repo.calls).toEqual(['readBrief']);
    expect(llm.calls).toHaveLength(0);
    expect(providers).toEqual([]);
  });

  it('a brief at the current head → stale: false (AC-36, AC-38)', async () => {
    const { service, repo, llm } = build();
    const brief = makeBrief({ run: { head_sha: 'sha-a' } });
    repo.read = { headSha: 'sha-a', brief };
    expect(await service.get(WS, PR_ID)).toEqual({ brief, stale: false });
    expect(llm.calls).toHaveLength(0);
  });

  it('the PR head moved past the brief → stale: true (AC-38, EC-4)', async () => {
    const { service, repo } = build();
    const brief = makeBrief({ run: { head_sha: 'sha-a' } });
    repo.read = { headSha: 'sha-b', brief };
    expect(await service.get(WS, PR_ID)).toEqual({ brief, stale: true });
  });

  it('a PR outside the workspace → NotFoundError (AC-39)', async () => {
    const { service, repo, llm } = build();
    repo.read = null;
    await expect(service.get(WS, PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(llm.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — the one model call (AC-42, AC-43, AC-47, AC-48)', () => {
  it('makes exactly one structured call with 0 retries, reasoning off, 2,000 output tokens and the Risk Brief model', async () => {
    const { service, repo, llm, providers } = build();
    repo.model = { provider: 'anthropic', model: 'claude-x' };
    await service.generate(WS, PR_ID);
    expect(providers).toEqual(['anthropic']);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({
      model: 'claude-x',
      maxTokens: 2000,
      maxRetries: 0,
      transportRetries: 0,
      reasoning: 'off',
      timeoutMs: 95_000,
    });
    expect(llm.calls[0]!.schema).toBe(BriefDraft);
  });

  it('the system message is the rendered template + INJECTION_GUARD; untrusted facts go to the user message (AC-70)', async () => {
    const { service, llm } = build();
    await service.generate(WS, PR_ID);
    const sys = systemMessage(llm);
    expect(sys.startsWith(SYSTEM)).toBe(true);
    expect(sys.trimEnd().endsWith(INJECTION_GUARD.trim())).toBe(true);
    const user = userMessage(llm);
    for (const mark of [TITLE_MARK, BODY_MARK, ISSUE_MARK, DOC_MARK, 'INTENT_SUMMARY', 'BLAST_SUMMARY']) {
      expect(user).toContain(mark);
      expect(sys).not.toContain(mark);
    }
  });

  it('describes files by path, role, +/- and changed ranges from the snapshot, never a hunk body (AC-40, AC-41, AC-89)', async () => {
    const { service, llm } = build();
    await service.generate(WS, PR_ID);
    const user = userMessage(llm);
    expect(user).toContain('src/ratelimit.ts · core · +20 −2 · lines 12-18');
    expect(user).toContain('src/login.ts');
    expect(user).toContain('lines 40');
    expect(user).not.toContain(PATCH_BODY_MARK);
    expect(user).not.toContain('@@');
  });

  it('R2 carry-over: each caller file reaches the model with its caller lines from the blast map (AC-40, AC-97)', async () => {
    const { service, llm } = build();
    await service.generate(WS, PR_ID);
    expect(userMessage(llm)).toContain('src/api/handler.ts (lines 12, 40)');
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — grounding, storage, stale (AC-50–AC-57, AC-97)', () => {
  it('stores a grounded brief stamped with the snapshot SHA, model, usage and time', async () => {
    const { service, repo } = build();
    await service.generate(WS, PR_ID);
    expect(repo.saves).toHaveLength(1);
    const brief = repo.saves[0]!;
    expect(brief.summary).toBe(DRAFT.summary);
    expect(brief.risks.risks.map((r) => r.title)).toEqual(['Spoofable limiter key', 'Caller breaks']);
    expect(brief.risks.risks[0]!.file_refs).toEqual(['src/ratelimit.ts:12-18']);
    expect(brief.review_focus).toEqual([
      { file: 'src/ratelimit.ts', line: 14, reason: 'Key derivation', outside_changed_lines: false },
      { file: 'src/login.ts', line: 5, reason: 'Outside the hunk', outside_changed_lines: true },
      { file: 'src/api/handler.ts', line: 40, reason: 'Caller on a caller line', outside_changed_lines: false },
      { file: 'src/api/handler.ts', line: null, reason: 'Caller, not a caller line', outside_changed_lines: false },
    ]);
    expect(brief.removed).toEqual({ risks: 1, file_refs: 0, review_focus: 1 });
    expect(brief.intent).toMatchObject({
      summary: 'INTENT_SUMMARY Rate-limit the login route.',
      in_scope: ['login'],
      out_of_scope: ['signup'],
    });
    expect(brief.blast).toEqual(BLAST);
    expect(brief.run).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      head_sha: HEAD,
      generated_at: NOW.toISOString(),
    });
    expect(brief.run.est_input_tokens).toBeGreaterThan(0);
    expect(brief.run.est_input_tokens).toBeLessThanOrEqual(8000);
    expect(Number.isInteger(brief.run.duration_ms)).toBe(true);
    expect(brief.run.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns what saveBrief returned, with no read after the write (review #4)', async () => {
    const { service, repo } = build();
    const out = await service.generate(WS, PR_ID);
    expect(out.brief).toBe(repo.returned[0]!.brief);
    expect(out.stale).toBe(false);
    expect(repo.calls).not.toContain('readBrief');
    expect(repo.calls.filter((c) => c === 'saveBrief')).toHaveLength(1);
  });

  it('stores the snapshot SHA even when the head moved during the call, and reports stale: true (review #1, AC-38)', async () => {
    const { service, repo } = build();
    repo.saveHead = 'sha-newer';
    const out = await service.generate(WS, PR_ID);
    expect(repo.saves[0]!.run.head_sha).toBe(HEAD);
    expect(out.stale).toBe(true);
  });

  it('a degraded blast map grounds against PR files only and records its reason (AC-53, AC-63)', async () => {
    const { service, repo, blast } = build();
    blast.value = { ...BLAST, degraded: true, reason: 'index_partial' };
    await service.generate(WS, PR_ID);
    const brief = repo.saves[0]!;
    expect(brief.risks.risks.map((r) => r.title)).toEqual(['Spoofable limiter key']);
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/ratelimit.ts', 'src/login.ts']);
    expect(brief.removed).toEqual({ risks: 2, file_refs: 0, review_focus: 3 });
    expect(brief.inputs).toContainEqual(expect.objectContaining({ input: 'blast', reason: 'index_partial' }));
  });

  it('a throwing blast source → generated without blast, note blast: unavailable (AC-63)', async () => {
    const { service, repo, llm, blast } = build();
    blast.value = new Error('index exploded');
    await service.generate(WS, PR_ID);
    expect(llm.calls).toHaveLength(1);
    const brief = repo.saves[0]!;
    expect(brief.blast).toBeNull();
    expect(brief.inputs).toContainEqual(expect.objectContaining({ input: 'blast', reason: 'unavailable' }));
    expect(brief.review_focus.map((f) => f.file)).not.toContain('src/api/handler.ts');
  });

  it('saveBrief → null (PR removed meanwhile) → NotFoundError, not logged as stored', async () => {
    const { service, repo, log } = build();
    repo.saveHead = null;
    await expect(service.generate(WS, PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(log.lines.filter((l) => l.obj.outcome === 'stored')).toEqual([]);
  });

  it('a throwing saveBrief is surfaced as is', async () => {
    const { service, repo } = build();
    const err = new AppError('invalid_brief', 'bad brief', 500);
    repo.saveError = err;
    await expect(service.generate(WS, PR_ID)).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — refusals without a model call (AC-39, AC-60, AC-67, AC-93)', () => {
  it('a PR outside the workspace → NotFoundError, 0 calls (AC-39)', async () => {
    const { service, repo, llm } = build();
    repo.snap = null;
    await expect(service.generate(WS, PR_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(llm.calls).toHaveLength(0);
    expect(repo.saves).toHaveLength(0);
  });

  it('no changed files loaded → 409 resync, 0 GitHub/LLM calls (AC-60, EC-27)', async () => {
    const { service, repo, llm, githubCalls, providers, log } = build();
    repo.snap = snapshot({}, []);
    const err = await caught(service.generate(WS, PR_ID));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/resync/i);
    expect(llm.calls).toHaveLength(0);
    expect(providers).toEqual([]);
    expect(githubCalls()).toBe(0);
    expect(repo.saves).toHaveLength(0);
    expect(log.refused()).toHaveLength(1);
    expect(log.refused()[0]!.obj).toMatchObject({ outcome: 'refused', llm_calls: 0 });
  });

  it.each([
    ['an older detail head', 'sha-older'],
    ['no detail head', null],
  ])('files not at the head commit (%s) → 409 resync, 0 GitHub/LLM calls (review #1)', async (_label, detail) => {
    const { service, repo, llm, githubCalls, providers, blast, log } = build();
    repo.snap = snapshot({ detailHeadSha: detail });
    const err = await caught(service.generate(WS, PR_ID));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/resync/i);
    expect(llm.calls).toHaveLength(0);
    expect(providers).toEqual([]);
    expect(githubCalls()).toBe(0);
    expect(blast.calls).toBe(0);
    expect(repo.saves).toHaveLength(0);
    expect(log.refused()[0]!.obj).toMatchObject({ outcome: 'refused', llm_calls: 0 });
  });

  it('no key for the Risk Brief provider → ConfigError naming the provider and Settings → Feature Models (AC-67)', async () => {
    const { service, llm, repo, log } = build({ llmError: new ConfigError('OPENAI_API_KEY is not configured') });
    const err = await caught(service.generate(WS, PR_ID));
    expect(err.code).toBe('config_error');
    expect(err.message).toMatch(/openai/i);
    expect(err.message).toMatch(/Feature Models/);
    expect(err.message).toMatch(/Risk Brief/);
    expect(llm.calls).toHaveLength(0);
    expect(repo.saves).toHaveLength(0);
    expect(log.refused()[0]!.obj).toMatchObject({ outcome: 'refused', llm_calls: 0 });
  });

  it('input over 8,000 tokens after every cut → 422 "too large", 0 calls (AC-93)', async () => {
    const { service, intent, llm, repo, log } = build();
    intent.record = intentRecord({ summary: 'never cut '.repeat(4000) });
    const err = await caught(service.generate(WS, PR_ID));
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/too large/i);
    expect(llm.calls).toHaveLength(0);
    expect(repo.saves).toHaveLength(0);
    expect(log.refused()[0]!.obj).toMatchObject({ outcome: 'refused', llm_calls: 0 });
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — model failures (AC-49, AC-68, AC-79)', () => {
  it.each([
    ['OpenAI', () => new ExternalServiceError('OpenAI structured output failed schema validation', { raw: RAW_MARK })],
    [
      'OpenRouter',
      () => new Error(`OpenRouter structured output failed schema validation for brief — attempt 1: ${RAW_MARK}`),
    ],
  ])('%s schema failure → invalid_brief 502 without the raw text, nothing stored (AC-49)', async (_p, make) => {
    const { service, llm, repo } = build();
    llm.script = async () => {
      throw make();
    };
    const err = await caught(service.generate(WS, PR_ID));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('invalid_brief');
    expect(err.statusCode).toBe(502);
    expect(err.message).toMatch(/invalid brief/i);
    expect(err.details).toBeUndefined();
    expect(JSON.stringify({ m: err.message, d: err.details })).not.toContain(RAW_MARK);
    expect(repo.saves).toHaveLength(0);
  });

  it('a provider error echoing the key → redacted external_service_error, nothing stored (AC-68, EC-22)', async () => {
    const { service, llm, repo, log } = build();
    llm.script = async () => {
      throw new Error(`401 Incorrect API key provided: ${FAKE_KEY}`);
    };
    const err = await caught(service.generate(WS, PR_ID));
    expect(err.code).toBe('external_service_error');
    expect(err.message).not.toContain(FAKE_KEY);
    expect(err.message).toContain('[redacted]');
    expect(repo.saves).toHaveLength(0);
    expect(log.text()).not.toContain(FAKE_KEY);
  });

  it.each(['resolves', 'rejects'] as const)(
    'no answer in time → llm_timeout 504; a late answer that %s writes nothing and is never unhandled (AC-68, AC-79)',
    async (late) => {
      const { service, llm, repo, log } = build({ timeoutMs: 20 });
      const answer = deferred<StructuredResult<unknown>>();
      llm.script = () => answer.promise;
      const err = await caught(service.generate(WS, PR_ID));
      expect(err.code).toBe('llm_timeout');
      expect(err.statusCode).toBe(504);

      if (late === 'resolves') answer.resolve(result());
      else answer.reject(new Error(`late failure ${FAKE_KEY}`));
      await tick(30);

      expect(repo.saves).toHaveLength(0);
      expect(llm.calls).toHaveLength(1);
      expect(log.finished()).toHaveLength(1);
      expect(log.finished()[0]!.obj.outcome).toBe('timeout');
    },
  );
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — single flight and retries (AC-42, AC-58, AC-59, EC-1)', () => {
  it('concurrent generates of one PR share one call and one result (AC-59)', async () => {
    const { service, llm, repo } = build();
    const answer = deferred<StructuredResult<unknown>>();
    const called = deferred<void>();
    llm.script = () => {
      called.resolve();
      return answer.promise;
    };
    const p1 = service.generate(WS, PR_ID);
    const p2 = service.generate(WS, PR_ID);
    await called.promise;
    const p3 = service.generate(WS, PR_ID); // arrives while the model call is running
    answer.resolve(result());
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(llm.calls).toHaveLength(1);
    expect(repo.saves).toHaveLength(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('concurrent generates with a failing model share the same error (AC-59)', async () => {
    const { service, llm } = build();
    const answer = deferred<StructuredResult<unknown>>();
    llm.script = () => answer.promise;
    const p1 = caught(service.generate(WS, PR_ID));
    const p2 = caught(service.generate(WS, PR_ID));
    answer.reject(new Error('provider 500'));
    const [e1, e2] = await Promise.all([p1, p2]);
    expect(llm.calls).toHaveLength(1);
    expect(e2.code).toBe(e1.code);
    expect(e2.message).toBe(e1.message);
  });

  it('two different PRs are not deduplicated', async () => {
    const { service, llm } = build();
    await Promise.all([service.generate(WS, PR_ID), service.generate(WS, PR_ID_2)]);
    expect(llm.calls).toHaveLength(2);
  });

  it('after a failure settles, a new generate starts exactly one new call (AC-42)', async () => {
    const { service, llm, repo } = build();
    llm.script = async () => {
      throw new Error('provider 500');
    };
    await caught(service.generate(WS, PR_ID));
    llm.script = async () => result();
    await service.generate(WS, PR_ID);
    expect(llm.calls).toHaveLength(2);
    expect(repo.saves).toHaveLength(1);
  });

  it('after a timeout, a retry starts exactly one new call while the old transport still runs (review #10)', async () => {
    const { service, llm, repo } = build({ timeoutMs: 20 });
    const stuck = deferred<StructuredResult<unknown>>();
    llm.script = () => stuck.promise;
    await caught(service.generate(WS, PR_ID));
    llm.script = async () => result();
    const out = await service.generate(WS, PR_ID);
    expect(llm.calls).toHaveLength(2);
    expect(repo.saves).toHaveLength(1);
    expect(out.brief?.summary).toBe(DRAFT.summary);
    stuck.resolve(result({ data: { ...DRAFT, summary: 'late one' } }));
    await tick(30);
    expect(repo.saves).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — degraded facts become notes (AC-61–AC-66, AC-86–AC-88)', () => {
  const notes = (repo: FakeRepo) => repo.saves[0]!.inputs;

  it('no intent → generated without it, intent: not_derived (AC-61, EC-5)', async () => {
    const { service, repo, intent, llm } = build();
    intent.record = null;
    await service.generate(WS, PR_ID);
    expect(llm.calls).toHaveLength(1);
    expect(repo.saves[0]!.intent).toBeNull();
    expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'intent', reason: 'not_derived' }));
  });

  it('an intent of another head commit is used and noted older_commit (AC-62, EC-6)', async () => {
    const { service, repo, intent, llm } = build();
    intent.record = intentRecord({ head_sha: 'sha-older' });
    await service.generate(WS, PR_ID);
    expect(userMessage(llm)).toContain('INTENT_SUMMARY');
    expect(repo.saves[0]!.intent?.summary).toBe('INTENT_SUMMARY Rate-limit the login route.');
    expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'intent', reason: 'older_commit' }));
  });

  it('an intent at the head adds no intent note', async () => {
    const { service, repo } = build();
    await service.generate(WS, PR_ID);
    expect(notes(repo).filter((n) => n.input === 'intent')).toEqual([]);
  });

  it('an empty description is noted pr_description: empty (AC-66, EC-10)', async () => {
    for (const body of ['', null]) {
      const { service, repo } = build();
      repo.snap = snapshot({ body });
      await service.generate(WS, PR_ID);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'pr_description', reason: 'empty' }));
    }
  });

  describe('linked issues (AC-64, AC-88)', () => {
    it('reads closing-linked issues first, then mentions; skips the PR itself; dedupes', async () => {
      const { service, repo, gh, llm } = build();
      gh.linked = [13];
      gh.issues[13] = { number: 13, title: 'Linked one', body: 'LINKED_13_BODY', state: 'open' };
      repo.snap = snapshot({ body: `${BODY_MARK} Closes #12. See #7 and #13.` });
      await service.generate(WS, PR_ID);
      expect(gh.getIssueCalls).toEqual([13, 12]);
      const user = userMessage(llm);
      expect(user).toContain('LINKED_13_BODY');
      expect(user).toContain(ISSUE_MARK);
      expect(user.indexOf('LINKED_13_BODY')).toBeLessThan(user.indexOf(ISSUE_MARK));
    });

    it('reads at most 3 issues and notes limit_reached (AC-88, EC-32)', async () => {
      const { service, repo, gh } = build();
      gh.linked = [21, 22, 23];
      for (const n of [21, 22, 23]) gh.issues[n] = { number: n, title: `Issue ${n}`, body: `body ${n}`, state: 'open' };
      await service.generate(WS, PR_ID);
      expect(gh.getIssueCalls).toEqual([21, 22, 23]);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'linked_issues', reason: 'limit_reached' }));
    });

    it('strips HTML comments and cuts an issue body to 3,000 chars (AC-88)', async () => {
      const { service, gh, llm } = build();
      gh.issues[12] = {
        number: 12,
        title: 'Long issue',
        body: `<!-- HIDDEN_COMMENT_MARK -->${'x'.repeat(5000)}`,
        state: 'open',
      };
      await service.generate(WS, PR_ID);
      const user = userMessage(llm);
      expect(user).not.toContain('HIDDEN_COMMENT_MARK');
      expect(user).toContain('x'.repeat(3000));
      expect(user).not.toContain('x'.repeat(3001));
    });

    it('a 404 issue → linked_issues not_found #12; generated (AC-64, EC-8)', async () => {
      const { service, repo, gh, llm } = build();
      delete gh.issues[12];
      await service.generate(WS, PR_ID);
      expect(llm.calls).toHaveLength(1);
      expect(notes(repo)).toContainEqual(
        expect.objectContaining({ input: 'linked_issues', reason: 'not_found', ref: '#12' }),
      );
    });

    it('another fetch error → linked_issues fetch_failed #12 (AC-64)', async () => {
      const { service, repo, gh } = build();
      gh.issues[12] = Object.assign(new Error('boom'), { status: 500 });
      await service.generate(WS, PR_ID);
      expect(notes(repo)).toContainEqual(
        expect.objectContaining({ input: 'linked_issues', reason: 'fetch_failed', ref: '#12' }),
      );
    });

    it('no GitHub token → linked_issues no_github_token; generated (AC-64, EC-8)', async () => {
      const { service, repo, llm } = build({ githubError: new ConfigError('GITHUB_TOKEN is not configured') });
      await service.generate(WS, PR_ID);
      expect(llm.calls).toHaveLength(1);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'linked_issues', reason: 'no_github_token' }));
    });

    it('no linked or mentioned issue → linked_issues none_linked', async () => {
      const { service, repo, gh } = build();
      repo.snap = snapshot({ body: `${BODY_MARK} No refs here.` });
      await service.generate(WS, PR_ID);
      expect(gh.getIssueCalls).toEqual([]);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'linked_issues', reason: 'none_linked' }));
    });
  });

  describe('spec docs (AC-65, AC-86, AC-87)', () => {
    it.each([true, false])('nothing attached → spec_docs none_attached, whatever clone says (clone: %s)', async (clone) => {
      const { service, repo, docs } = build();
      docs.value = { attached: [], docs: [], skipped: [], clone };
      await service.generate(WS, PR_ID);
      const specNotes = notes(repo).filter((n) => n.input === 'spec_docs');
      expect(specNotes).toEqual([expect.objectContaining({ input: 'spec_docs', reason: 'none_attached' })]);
    });

    it('attached but no clone → spec_docs no_clone', async () => {
      const { service, repo, docs } = build();
      docs.value = { attached: ['docs/limits.md'], docs: [], skipped: ['docs/limits.md'], clone: false };
      await service.generate(WS, PR_ID);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'spec_docs', reason: 'no_clone' }));
    });

    it('an unreadable attached doc → spec_docs unreadable with its path; the others are sent', async () => {
      const { service, repo, docs, llm } = build();
      docs.value = {
        attached: ['docs/limits.md', 'docs/missing.md'],
        docs: [{ path: 'docs/limits.md', text: `${DOC_MARK} ok` }],
        skipped: ['docs/missing.md'],
        clone: true,
      };
      await service.generate(WS, PR_ID);
      expect(userMessage(llm)).toContain(DOC_MARK);
      expect(notes(repo)).toContainEqual(
        expect.objectContaining({ input: 'spec_docs', reason: 'unreadable', ref: 'docs/missing.md' }),
      );
    });

    it('R1 B1 carry-over: a docs source that throws ExternalServiceError → generated, spec_docs unreadable (AC-65)', async () => {
      const { service, repo, docs, llm } = build();
      docs.value = new ExternalServiceError("Could not list the repo's documents: fatal: not a tree object");
      await service.generate(WS, PR_ID);
      expect(llm.calls).toHaveLength(1);
      expect(repo.saves).toHaveLength(1);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'spec_docs', reason: 'unreadable' }));
    });

    it('R1 B1 carry-over: the real ProjectContextService over a git whose listTree REJECTS → still generated (AC-65)', async () => {
      const contextRepo = {
        findRepo: async () => ({ id: REPO_ID, owner: 'acme', name: 'shop' }),
        attachedPathsForRepo: async () => ['docs/limits.md'],
      } as unknown as ContextRepo;
      const git: DocSource = {
        listTree: async () => {
          throw new Error('fatal: not a tree object');
        },
        showFile: async () => null,
      } as unknown as DocSource;
      const projectContext = new ProjectContextService({
        repo: contextRepo,
        skills: {} as ProjectContextDeps['skills'],
        git,
      });
      const { service, repo, llm } = build({ docs: projectContext });
      await service.generate(WS, PR_ID);
      expect(llm.calls).toHaveLength(1);
      expect(repo.saves).toHaveLength(1);
      expect(notes(repo)).toContainEqual(expect.objectContaining({ input: 'spec_docs', reason: 'unreadable' }));
    });
  });

  it('budget notes from the prompt builder land in brief.inputs (AC-46)', async () => {
    const { service, repo, docs } = build();
    docs.value = {
      attached: ['docs/huge.md'],
      docs: [{ path: 'docs/huge.md', text: 'd'.repeat(60_000) }],
      skipped: [],
      clone: true,
    };
    await service.generate(WS, PR_ID);
    const spec = notes(repo).find((n) => n.input === 'spec_docs');
    expect(spec?.ref).toBe('docs/huge.md');
    expect(['truncated', 'omitted_budget']).toContain(spec?.reason);
  });
});

// ---------------------------------------------------------------------------------

describe('BriefService.generate — one log line per ended model call (AC-69, review #9)', () => {
  const forbidden = [TITLE_MARK, BODY_MARK, ISSUE_MARK, DOC_MARK, RAW_MARK, SUMMARY_MARK, 'INTENT_SUMMARY', FAKE_KEY];
  const expectClean = (log: FakeLog) => {
    const text = log.text();
    for (const mark of forbidden) expect(text).not.toContain(mark);
  };

  it('stored: provider, model, estimate, usage, cost, outcome and duration', async () => {
    const { service, log } = build();
    await service.generate(WS, PR_ID);
    expect(log.finished()).toHaveLength(1);
    const line = log.finished()[0]!;
    expect(line.level).toBe('info');
    expect(line.obj).toMatchObject({
      prId: PR_ID,
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      outcome: 'stored',
    });
    expect(typeof line.obj.est_input_tokens).toBe('number');
    expect(typeof line.obj.ms).toBe('number');
    expectClean(log);
  });

  it.each([
    ['invalid', () => new ExternalServiceError('OpenAI structured output failed schema validation', { raw: RAW_MARK })],
    ['error', () => new Error(`401 Incorrect API key provided: ${FAKE_KEY}`)],
  ])('%s: one line with null (unknown) usage, never 0, and no raw/model text', async (outcome, make) => {
    const { service, llm, log } = build();
    llm.script = async () => {
      throw make();
    };
    await caught(service.generate(WS, PR_ID));
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj).toMatchObject({
      outcome,
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
    });
    expectClean(log);
  });

  it('timeout: one line with null usage', async () => {
    const { service, llm, log } = build({ timeoutMs: 20 });
    llm.script = () => new Promise(() => undefined);
    await caught(service.generate(WS, PR_ID));
    expect(log.finished()).toHaveLength(1);
    expect(log.finished()[0]!.obj).toMatchObject({ outcome: 'timeout', tokens_in: null, tokens_out: null, cost_usd: null });
    expectClean(log);
  });

  it('refused: outcome refused, llm_calls 0, no PR text', async () => {
    const { service, repo, log } = build();
    repo.snap = snapshot({ detailHeadSha: 'sha-older' });
    await caught(service.generate(WS, PR_ID));
    expect(log.finished()).toHaveLength(0);
    expect(log.refused()).toHaveLength(1);
    expectClean(log);
  });

  it('two concurrent requests → one line (AC-59)', async () => {
    const { service, log } = build();
    await Promise.all([service.generate(WS, PR_ID), service.generate(WS, PR_ID)]);
    expect(log.finished()).toHaveLength(1);
  });
});
