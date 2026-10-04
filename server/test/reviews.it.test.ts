import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { SmartDiff, type Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        // No real keys or GitHub: the pre-review intent step would otherwise call
        // the developer's GitHub/OpenRouter (slow, paid) — here it falls back.
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    // L01 cost: the mock LLM reports $0.001 per call → persisted on the run,
    // echoed into the trace stats and the runs list; the run remembers the SHA.
    expect(run!.costUsd).toBeGreaterThan(0);
    expect(run!.headSha).toBe('a1b2c3d4');
    expect(trace.stats.cost_usd).toBe(run!.costUsd);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBe(run!.costUsd);

    await app.close();
  });

  it('PR list COST sums only the done runs of the last review round', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const db = pg.handle.db;
    const { repo, pr } = await setupRepoAndPr(db, workspaceId);
    // A new commit landed after the last review (stale PR): the round is still
    // the reviewed SHA, not the current head.
    await db
      .update(t.pullRequests)
      .set({ lastReviewedSha: 'reviewed1', headSha: 'newhead2' })
      .where(eq(t.pullRequests.id, pr.id));
    const base = { workspaceId, prId: pr.id, provider: 'openai', model: 'gpt-4.1' };
    await db.insert(t.agentRuns).values([
      { ...base, status: 'done', headSha: 'reviewed1', costUsd: 0.002 },
      { ...base, status: 'done', headSha: 'reviewed1', costUsd: 0.0015 },
      { ...base, status: 'done', headSha: 'reviewed1', costUsd: null }, // unpriced model
      { ...base, status: 'failed', headSha: 'reviewed1', costUsd: 0.5 }, // not done
      { ...base, status: 'done', headSha: 'older0', costUsd: 0.9 }, // previous round
    ]);
    // A second PR with no runs at all → no cost.
    const [bare] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 483,
        title: 'Unreviewed',
        author: 'deepak.r',
        branch: 'feat/x',
        base: 'main',
        headSha: 'ffff',
        status: 'open',
      })
      .returning();

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byId = new Map(list.map((p: { id: string; cost_usd: number | null }) => [p.id, p.cost_usd]));
    expect(byId.get(pr.id)).toBeCloseTo(0.0035, 10);
    expect(byId.get(bare!.id)).toBeNull();

    await app.close();
  });

  it('PR list FINDINGS counts the latest review per severity (same review as SCORE)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const db = pg.handle.db;
    const { repo, pr } = await setupRepoAndPr(db, workspaceId);
    const review = (createdAt: string, score: number, kind: 'review' | 'summary' = 'review') => ({
      workspaceId,
      prId: pr.id,
      kind,
      score,
      createdAt: new Date(createdAt),
    });
    const [older, latest] = await db
      .insert(t.reviews)
      .values([
        review('2026-01-01T00:00:00Z', 30),
        review('2026-01-02T00:00:00Z', 70),
        review('2026-01-03T00:00:00Z', 0, 'summary'), // not a review → ignored
      ])
      .returning();
    const finding = (reviewId: string, severity: string) => ({
      reviewId,
      severity,
      file: 'src/config.ts',
      startLine: 11,
      endLine: 11,
      category: 'bug',
      title: `${severity} finding`,
      rationale: 'r',
      confidence: 0.9,
    });
    await db.insert(t.findings).values([
      finding(older!.id, 'CRITICAL'), // previous review → not counted
      finding(older!.id, 'CRITICAL'),
      finding(latest!.id, 'CRITICAL'),
      finding(latest!.id, 'SUGGESTION'),
      finding(latest!.id, 'SUGGESTION'),
    ]);
    // Reviewed with a clean result → zeros, not null.
    const [clean] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 484,
        title: 'Clean',
        author: 'deepak.r',
        branch: 'feat/clean',
        base: 'main',
        headSha: 'eeee',
        status: 'open',
      })
      .returning();
    await db.insert(t.reviews).values({ workspaceId, prId: clean!.id, kind: 'review', score: 100 });
    // Never reviewed → null.
    const [bare] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 485,
        title: 'Unreviewed',
        author: 'deepak.r',
        branch: 'feat/y',
        base: 'main',
        headSha: 'dddd',
        status: 'open',
      })
      .returning();

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const byId = new Map(list.map((p: { id: string }) => [p.id, p]));
    expect(byId.get(pr.id)).toMatchObject({
      score: 70,
      findings_count: { critical: 1, warning: 0, suggestion: 2 },
    });
    expect(byId.get(clean!.id)).toMatchObject({
      findings_count: { critical: 0, warning: 0, suggestion: 0 },
    });
    expect(byId.get(bare!.id)).toMatchObject({ findings_count: null });

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  it('smart-diff: groups pr_files by role + latest-review finding lines, no LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
    const db = pg.handle.db;
    const { pr } = await setupRepoAndPr(db, workspaceId);
    await db.insert(t.prFiles).values([
      { prId: pr.id, path: 'pnpm-lock.yaml', additions: 40, deletions: 10 },
      { prId: pr.id, path: 'README.md', additions: 3, deletions: 1 },
      { prId: pr.id, path: 'src/config.test.ts', additions: 5, deletions: 0 },
    ]);
    const url = `/pulls/${pr.id}/smart-diff`;
    const fileOf = (d: SmartDiff, path: string) =>
      d.groups.flatMap((g) => g.files).find((f) => f.path === path);

    // (a) before any review
    const before = await app.inject({ method: 'GET', url });
    expect(before.statusCode).toBe(200);
    const d0 = SmartDiff.parse(before.json());
    expect(d0.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(d0.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(d0.split_suggestion.total_lines).toBe(1 + 50 + 4 + 5);

    // (b) older + newer review of one seeded agent, a newer summary, a dismissed finding
    const [agent] = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const review = (createdAt: string, kind: 'review' | 'summary' = 'review') => ({
      workspaceId,
      prId: pr.id,
      agentId: agent!.id,
      kind,
      createdAt: new Date(createdAt),
    });
    const [older, newer, summary] = await db
      .insert(t.reviews)
      .values([
        review('2026-01-01T00:00:00Z'),
        review('2026-01-02T00:00:00Z'),
        review('2026-01-03T00:00:00Z', 'summary'),
      ])
      .returning();
    const finding = (reviewId: string, startLine: number, dismissed = false) => ({
      reviewId,
      file: 'src/config.ts',
      startLine,
      endLine: startLine,
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.9,
      dismissedAt: dismissed ? new Date() : null,
    });
    await db.insert(t.findings).values([
      finding(older!.id, 5), // older review → ignored
      finding(newer!.id, 12),
      finding(newer!.id, 11),
      finding(newer!.id, 30, true), // dismissed → excluded
      finding(summary!.id, 40), // summary → ignored
    ]);
    const d1 = SmartDiff.parse((await app.inject({ method: 'GET', url })).json());
    expect(fileOf(d1, 'src/config.ts')?.finding_lines).toEqual([11, 12]);
    expect(fileOf(d1, 'README.md')?.finding_lines).toEqual([]);

    // (c) unknown PR → 404
    const missing = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff',
    });
    expect(missing.statusCode).toBe(404);

    // (d) a PR of another workspace → 404
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const { pr: foreign } = await setupRepoAndPr(db, otherWs!.id);
    const cross = await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/smart-diff` });
    expect(cross.statusCode).toBe(404);

    expect(llm.calls).toHaveLength(0);
    await app.close();
  });
});
