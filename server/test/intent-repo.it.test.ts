import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { findingRowToDto } from '../src/modules/reviews/helpers.js';
import type { IntentRecordWrite } from '../src/modules/reviews/intent/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const RECORD: IntentRecordWrite = {
  summary: 'Add session refresh to the login flow.',
  in_scope: ['session refresh', 'login'],
  out_of_scope: ['billing'],
  head_sha: 'abc1234',
  input_hash: 'hash-1',
  confidence: 'medium',
  mode: 'llm',
  missing_context: true,
  context_gaps: ['Linked spec could not be read'],
  sources_used: [
    { kind: 'title', ref: 'title' },
    { kind: 'linked_issue', ref: '#12', title: 'Refresh sessions', truncated: false },
  ],
  unresolved_refs: [{ kind: 'doc', ref: 'specs/missing.md', reason: 'not_found' }],
  prompt_components: [
    { component: 'title', ref: null, chars: 40, est_tokens: 10 },
    { component: 'issue', ref: '#12', chars: 1240, est_tokens: 310, truncated: false },
  ],
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  tokens_in: 2790,
  tokens_out: 180,
  cost_usd: 0.0004,
  fallback_reason: null,
};

function finding(partial: Partial<Finding>): Finding {
  return {
    id: 'f',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

/** pr_intent / findings.scope persistence, scoped by workspace (Testcontainers pg). */
d('ReviewRepository intent + findings.scope (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let wsA: string;
  let wsB: string;
  let prA: string;
  let prB: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    repo = new ReviewRepository(db);
    const [a, b] = await db.insert(t.workspaces).values([{ name: 'a' }, { name: 'b' }]).returning();
    wsA = a!.id;
    wsB = b!.id;
    const [repoA] = await db
      .insert(t.repos)
      .values({ workspaceId: wsA, owner: 'acme', name: 'shop', fullName: 'acme/shop' })
      .returning();
    const [repoB] = await db
      .insert(t.repos)
      .values({ workspaceId: wsB, owner: 'other', name: 'app', fullName: 'other/app' })
      .returning();
    const pull = (workspaceId: string, repoId: string) => ({
      workspaceId,
      repoId,
      number: 7,
      title: 'Session refresh',
      author: 'dev',
      branch: 'feat/session-refresh',
      base: 'main',
      headSha: 'abc1234',
      body: 'Closes #12',
    });
    const [pA] = await db.insert(t.pullRequests).values(pull(wsA, repoA!.id)).returning();
    const [pB] = await db.insert(t.pullRequests).values(pull(wsB, repoB!.id)).returning();
    prA = pA!.id;
    prB = pB!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns null before any intent is stored', async () => {
    expect(await repo.getIntentRecord(wsA, prA)).toBeNull();
  });

  it('round-trips every field, mapping the intent column to summary', async () => {
    const saved = await repo.saveIntentRecord(wsA, prA, RECORD);
    expect(saved?.summary).toBe(RECORD.summary);

    const stored = await repo.getIntentRecord(wsA, prA);
    expect(stored?.inputHash).toBe('hash-1');
    const { input_hash: _hash, ...contractFields } = RECORD;
    expect(stored?.record).toMatchObject({ ...contractFields, pr_id: prA });
    expect(typeof stored?.record.updated_at).toBe('string');

    const [row] = await pg.handle.db.select().from(t.prIntent);
    expect(row?.intent).toBe(RECORD.summary);
  });

  it('upserts: a second save replaces the record', async () => {
    await repo.saveIntentRecord(wsA, prA, {
      ...RECORD,
      summary: 'Fallback summary',
      mode: 'fallback',
      confidence: 'low',
      input_hash: 'hash-2',
      provider: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      fallback_reason: 'no key',
      sources_used: [],
      unresolved_refs: [],
      prompt_components: [],
    });
    const stored = await repo.getIntentRecord(wsA, prA);
    expect(stored?.record).toMatchObject({
      summary: 'Fallback summary',
      mode: 'fallback',
      confidence: 'low',
      fallback_reason: 'no key',
      sources_used: [],
    });
    expect(stored?.inputHash).toBe('hash-2');
    expect(await pg.handle.db.select().from(t.prIntent)).toHaveLength(1);
  });

  it('another workspace reads null and cannot write', async () => {
    expect(await repo.getIntentRecord(wsB, prA)).toBeNull();
    expect(await repo.saveIntentRecord(wsB, prA, { ...RECORD, summary: 'hijack' })).toBeNull();
    expect((await repo.getIntentRecord(wsA, prA))?.record.summary).toBe('Fallback summary');
    expect(await repo.getIntentRecord(wsA, prB)).toBeNull();
  });

  it('getPullForIntent returns PR fields + repo, scoped by workspace', async () => {
    expect(await repo.getPullForIntent(wsA, prA)).toEqual({
      id: prA,
      number: 7,
      title: 'Session refresh',
      body: 'Closes #12',
      branch: 'feat/session-refresh',
      base: 'main',
      headSha: 'abc1234',
      repo: { owner: 'acme', name: 'shop' },
    });
    expect(await repo.getPullForIntent(wsB, prA)).toBeNull();
  });

  it('intentFeatureModel: registry default, then the workspace override', async () => {
    expect(await repo.intentFeatureModel(wsA)).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    await pg.handle.db.insert(t.settings).values({
      workspaceId: wsA,
      key: 'feature_models',
      value: { review_intent: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' } },
    });
    expect(await repo.intentFeatureModel(wsA)).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    });
    // The override is per workspace.
    expect((await repo.intentFeatureModel(wsB)).model).toBe('deepseek/deepseek-v4-flash');
  });

  it('insertFindings persists scope; findingRowToDto maps it, legacy rows give null', async () => {
    const review = await repo.insertReview({
      workspaceId: wsA,
      prId: prA,
      agentId: null,
      runId: null,
      kind: 'review',
      verdict: 'comment',
      summary: 's',
      score: 80,
      model: 'm',
    });
    const rows = await repo.insertFindings(review.id, [
      finding({ title: 'out', scope: 'out' }),
      finding({ title: 'in', scope: 'in' }),
      finding({ title: 'untagged' }),
    ]);
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, findingRowToDto(r).scope]));
    expect(byTitle).toEqual({ out: 'out', in: 'in', untagged: null });

    // A row written without the column (pre-intent) maps to null.
    const [legacy] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review.id,
        file: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'bug',
        title: 'legacy',
        rationale: 'r',
        confidence: 0.5,
      })
      .returning();
    expect(findingRowToDto(legacy!).scope).toBeNull();
  });
});
