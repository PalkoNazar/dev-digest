import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ChatMessage, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { makeZip } from './helpers/zip.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/discount.ts b/src/discount.ts
--- a/src/discount.ts
+++ b/src/discount.ts
@@ -1,2 +1,3 @@
 export function discount(total: number) {
+  if (total > 100) return total * 0.9;
   return total;`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/** One grounded finding on the added branch (new-side line 2 of DIFF). */
const TEST_FINDING_REVIEW: Review = {
  verdict: 'comment',
  summary: 'Branch not tested.',
  score: 88,
  findings: [
    {
      id: 'f1',
      severity: 'WARNING',
      category: 'test',
      title: 'The >100 discount branch has no test',
      file: 'src/discount.ts',
      start_line: 2,
      end_line: 2,
      rationale: 'No test reaches total > 100.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

/**
 * L02 skills — CRUD + versions, import preview (stores nothing), per-agent links
 * (enabled + order + agent version bump), and the review run: only skills that
 * are enabled both globally and for the agent reach the prompt and the trace.
 */
d('L02 skills (Testcontainers pg)', () => {
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

  function makeApp(llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
  }

  let seq = 0;
  const skillBody = (over: Record<string, unknown> = {}) => ({
    name: `skill-${seq++}`,
    description: 'When a diff adds a branch, flag it if no test covers it.',
    type: 'rubric',
    body: 'Every new if/else needs a test for each side.',
    ...over,
  });

  it('CRUD: create, list, edit (body bumps version), 409 on duplicate, delete', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name: 'crud-skill' }) });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'crud-skill', source: 'manual', enabled: true, version: 1 });

    const dup = await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name: 'crud-skill' }) });
    expect(dup.statusCode).toBe(409);

    const bad = await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name: 'Not A Slug' }) });
    expect(bad.statusCode).toBe(422);

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'Changed.' } })
    ).json();
    expect(edited.version).toBe(2);
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => v.body).sort()).toEqual(['Changed.', 'Every new if/else needs a test for each side.']);

    const history = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(history.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(history[0].body).toBe('Changed.');

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('import preview parses a zip, ignores its scripts and stores nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const zip = makeZip({
      'flaky/SKILL.md': '---\nname: flaky-hunter\ndescription: Flag flaky tests.\n---\n# Flaky\nNo sleeps.',
      'flaky/scripts/run.sh': '#!/bin/sh\necho pwned',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'flaky.zip', content_base64: zip.toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'flaky-hunter',
      description: 'Flag flaky tests.',
      ignored_files: ['flaky/scripts/run.sh'],
    });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.exe', content_base64: Buffer.from('MZ').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('agent links: order + per-agent enabled, skill_count, version bump, foreign skill → 404', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `linker-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody() })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody() })).json();

    const links = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(links.statusCode).toBe(200);
    expect(links.json()).toEqual([
      { agent_id: agent.id, skill_id: b.id, order: 0, enabled: true },
      { agent_id: agent.id, skill_id: a.id, order: 1, enabled: false },
    ]);

    expect((await app.inject({ method: 'GET', url: `/skills/${a.id}` })).json().agent_count).toBe(1);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after.version).toBe(2);
    expect(after.skill_count).toBe(1);
    const v2 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions/2` })).json();
    expect(v2.config.skills).toEqual([b.id]);

    // same effective set (only a disabled link moves) → no new version
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: a.id, enabled: false }, { skill_id: b.id, enabled: true }] },
    });
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(2);

    const foreign = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: '00000000-0000-4000-8000-000000000000', enabled: true }] },
    });
    expect(foreign.statusCode).toBe(404);
    await app.close();
  });

  it('a review run puts only enabled skills into the prompt and the trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: TEST_FINDING_REVIEW });
    const app = await makeApp(llm);
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'shop', fullName: 'acme/shop' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add discount',
        author: 'dev',
        branch: 'feat/discount',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Test Quality', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review tests' },
      })
    ).json();
    const on = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name: 'branch-coverage' }) })).json();
    const offForAgent = (
      await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ name: 'agent-off', body: 'AGENT_OFF_MARKER' }) })
    ).json();
    const offGlobally = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: skillBody({ name: 'global-off', body: 'GLOBAL_OFF_MARKER', enabled: false }),
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        links: [
          { skill_id: offGlobally.id, enabled: true },
          { skill_id: on.id, enabled: true },
          { skill_id: offForAgent.id, enabled: false },
        ],
      },
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const [run] = await waitForPrRuns(db, pr!.id, { expected: 1 });
    expect(run!.status).toBe('done');

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const user = (call!.req as { messages: ChatMessage[] }).messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Skills / rules\n### branch-coverage\nWhen a diff adds a branch');
    expect(user).not.toContain('AGENT_OFF_MARKER');
    expect(user).not.toContain('GLOBAL_OFF_MARKER');

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toContain('### branch-coverage');
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);
    expect(trace.skills_used).toEqual([{ id: on.id, name: 'branch-coverage', version: 1 }]);
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('Skills: 1 attached (branch-coverage v1)'))).toBe(true);

    // Stats: the run pulled `branch-coverage` (not the agent-disabled one); its
    // finding counts for the skill, and accepting it moves the accept rate.
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/reviews` })).json();
    await app.inject({ method: 'POST', url: `/findings/${reviews[0].findings[0].id}/accept` });
    const stats = (await app.inject({ method: 'GET', url: `/skills/${on.id}/stats` })).json();
    expect(stats).toMatchObject({
      window_days: 30,
      runs_total: 1,
      runs_with_skill: 1,
      pull_rate: 1,
      findings: 1,
      accepted: 1,
      accept_rate: 1,
      by_category: [{ category: 'test', count: 1 }],
    });
    expect(stats.agents).toEqual([
      { id: agent.id, name: 'Test Quality', link_enabled: true, agent_enabled: true },
    ]);
    const off = (await app.inject({ method: 'GET', url: `/skills/${offForAgent.id}/stats` })).json();
    expect(off).toMatchObject({ runs_total: 1, runs_with_skill: 0, pull_rate: 0, findings: 0, accept_rate: null });
    await app.close();
  });
});
