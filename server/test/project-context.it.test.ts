import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { GitTreeEntry } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ProjectContextRepository } from '../src/modules/project-context/repository.js';

/**
 * L05 Project Context (plan S6): attachment routes over real Postgres, with
 * MockGitClient serving the repo's tree and blobs at HEAD.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES: Record<string, string> = {
  'AGENTS.md': '# Agents doc text',
  'README.md': '# Readme',
  'specs/a.md': 'Spec A',
  'specs/b.md': 'Spec B',
  'docs/guide.md': 'Guide',
  // the link text of the in-tree symlink, as `git show HEAD:CLAUDE.md` returns it
  'CLAUDE.md': 'AGENTS.md',
};
const TREE: GitTreeEntry[] = [
  ...Object.keys(FILES)
    .filter((p) => p !== 'CLAUDE.md')
    .map((path) => ({ path, mode: '100644', size: FILES[path]!.length })),
  { path: 'CLAUDE.md', mode: '120000', size: 9 },
];

d('L05 project context (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ filesAtRef: FILES, tree: TREE }),
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function newRepo(ws = workspaceId) {
    const name = `docs-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function newAgent() {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `ctx-agent-${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function newSkill() {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `ctx-skill-${seq++}`,
        description: 'Checks the diff against the attached specs.',
        type: 'rubric',
        body: 'Follow the specs.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  const put = (kind: 'agents' | 'skills', id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { repo_id: repoId, paths } });
  const get = (kind: 'agents' | 'skills', id: string, repoId: string) =>
    app.inject({ method: 'GET', url: `/${kind}/${id}/context?repo_id=${repoId}` });

  it('lists the repo documents, including an in-tree symlink, and reads one', async () => {
    const repo = await newRepo();
    const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(list.statusCode).toBe(200);
    expect(list.json().map((f: { path: string }) => f.path)).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'docs/guide.md',
      'specs/a.md',
      'specs/b.md',
    ]);

    const link = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=CLAUDE.md`,
    });
    expect(link.statusCode).toBe(200);
    expect(link.json()).toMatchObject({ path: 'CLAUDE.md', category: 'root', content: '# Agents doc text' });

    const outside = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=${encodeURIComponent('../../etc/passwd')}`,
    });
    expect(outside.statusCode).toBe(404);
  });

  it('PUT then GET keeps the attachment order (AC-13–AC-15)', async () => {
    const repo = await newRepo();
    const agent = await newAgent();

    const saved = await put('agents', agent.id, repo.id, ['specs/b.md', 'README.md', 'specs/a.md']);
    expect(saved.statusCode).toBe(200);
    const view = (await get('agents', agent.id, repo.id)).json();
    expect(view.attached).toBe(3);
    expect(view.total).toBe(6);
    expect(view.rows.slice(0, 3).map((r: { path: string; state: string }) => [r.path, r.state])).toEqual([
      ['specs/b.md', 'attached'],
      ['README.md', 'attached'],
      ['specs/a.md', 'attached'],
    ]);

    // reorder + untick
    await put('agents', agent.id, repo.id, ['specs/a.md', 'specs/b.md']);
    const after = (await get('agents', agent.id, repo.id)).json();
    expect(after.attached).toBe(2);
    expect(after.rows.slice(0, 2).map((r: { path: string }) => r.path)).toEqual(['specs/a.md', 'specs/b.md']);
    expect(after.rows.find((r: { path: string }) => r.path === 'README.md').state).toBe('available');
  });

  it('a skill attachment shows on the agent as inherited "via", and as attached "also via" (AC-42, AC-46)', async () => {
    const repo = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: skill.id, enabled: true }] },
    });
    expect(link.statusCode).toBe(200);

    expect((await put('skills', skill.id, repo.id, ['docs/guide.md'])).statusCode).toBe(200);
    const skillView = (await get('skills', skill.id, repo.id)).json();
    expect(skillView.attached).toBe(1);
    expect(skillView.rows[0]).toMatchObject({ path: 'docs/guide.md', state: 'attached' });

    const inherited = (await get('agents', agent.id, repo.id)).json();
    expect(inherited.attached).toBe(0);
    expect(inherited.rows[0]).toMatchObject({ path: 'docs/guide.md', state: 'inherited', via: [skill.name] });

    await put('agents', agent.id, repo.id, ['docs/guide.md']);
    const both = (await get('agents', agent.id, repo.id)).json();
    expect(both.rows.filter((r: { path: string }) => r.path === 'docs/guide.md')).toEqual([
      expect.objectContaining({ state: 'attached', via: [skill.name] }),
    ]);
  });

  it('an attached in-tree symlink injects its target text into a run', async () => {
    const repo = await newRepo();
    const agent = await newAgent();
    await put('agents', agent.id, repo.id, ['CLAUDE.md']);
    const ctx = await app.container.projectContext.forRun(workspaceId, agent.id, repo.id);
    expect(ctx.injected).toEqual([{ path: 'CLAUDE.md', text: '# Agents doc text', truncated: false }]);
  });

  it('attachments are separate per repo (EC-9)', async () => {
    const repoA = await newRepo();
    const repoB = await newRepo();
    const agent = await newAgent();
    await put('agents', agent.id, repoA.id, ['specs/a.md']);
    expect((await get('agents', agent.id, repoA.id)).json().attached).toBe(1);
    expect((await get('agents', agent.id, repoB.id)).json().attached).toBe(0);
  });

  it('deleting the agent or the skill removes its attachment rows (AC-44)', async () => {
    const repo = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    await put('agents', agent.id, repo.id, ['specs/a.md']);
    await put('skills', skill.id, repo.id, ['specs/b.md']);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);

    const agentRows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agent.id), eq(t.agentContextDocs.repoId, repo.id)));
    const skillRows = await pg.handle.db
      .select()
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skill.id), eq(t.skillContextDocs.repoId, repo.id)));
    expect(agentRows).toEqual([]);
    expect(skillRows).toEqual([]);
  });

  it('an unknown agent or one from another workspace is 404', async () => {
    const repo = await newRepo();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'foreign', provider: 'openai', model: 'gpt-4.1', systemPrompt: 's' })
      .returning();

    expect((await get('agents', foreign!.id, repo.id)).statusCode).toBe(404);
    expect((await put('agents', foreign!.id, repo.id, ['specs/a.md'])).statusCode).toBe(404);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await get('agents', unknown, repo.id)).statusCode).toBe(404);
    expect((await get('skills', unknown, repo.id)).statusCode).toBe(404);

    const rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, foreign!.id));
    expect(rows).toEqual([]);
  });

  it('a bad or duplicate path is 422 and stores nothing (AC-40, EC-20)', async () => {
    const repo = await newRepo();
    const agent = await newAgent();
    await put('agents', agent.id, repo.id, ['specs/a.md']);

    for (const paths of [
      ['specs/a.md', '../../etc/passwd'],
      ['docs/nope.md'],
      ['specs/b.md', 'specs/b.md'],
      [''],
    ]) {
      const res = await put('agents', agent.id, repo.id, paths);
      expect(res.statusCode).toBe(422);
    }
    const view = (await get('agents', agent.id, repo.id)).json();
    expect(view.rows.filter((r: { state: string }) => r.state === 'attached').map((r: { path: string }) => r.path)).toEqual([
      'specs/a.md',
    ]);
  });

  it('repo-wide attached paths: agent ∪ skill, distinct, sorted, scoped by repo and workspace (PR Brief AC-86)', async () => {
    const repo = await newRepo();
    const otherRepo = await newRepo();
    const agentA = await newAgent();
    const agentB = await newAgent();
    const skill = await newSkill();
    await put('agents', agentA.id, repo.id, ['specs/b.md', 'AGENTS.md']);
    await put('agents', agentB.id, repo.id, ['specs/b.md']);
    await put('skills', skill.id, repo.id, ['docs/guide.md', 'AGENTS.md']);
    await put('agents', agentA.id, otherRepo.id, ['README.md']);

    const repoPc = new ProjectContextRepository(pg.handle.db);
    expect(await repoPc.attachedPathsForRepo(workspaceId, repo.id)).toEqual([
      'AGENTS.md',
      'docs/guide.md',
      'specs/b.md',
    ]);
    expect(await repoPc.attachedPathsForRepo(workspaceId, otherRepo.id)).toEqual(['README.md']);

    // A foreign workspace sees nothing, even for the same repo id.
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    expect(await repoPc.attachedPathsForRepo(other!.id, repo.id)).toEqual([]);

    const docs = await app.container.projectContext.repoDocs(workspaceId, repo.id);
    expect(docs.docs.map((d) => d.path)).toEqual(['AGENTS.md', 'docs/guide.md', 'specs/b.md']);
    expect(docs.docs[0]?.text).toBe('# Agents doc text');
    expect(docs.skipped).toEqual([]);
    expect((await app.container.projectContext.repoDocs(other!.id, repo.id)).attached).toEqual([]);
  });
});

