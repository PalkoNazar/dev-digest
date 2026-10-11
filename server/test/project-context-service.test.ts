import { describe, it, expect } from 'vitest';
import type { GitTreeEntry, RepoRef } from '@devdigest/shared';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type {
  ContextRepo,
  EffectiveSkillsSource,
} from '../src/modules/project-context/ports.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { ConflictError, ValidationError } from '../src/platform/errors.js';

/**
 * L05 — ProjectContextService (plan S6) with hand-written fakes of its ports and
 * MockGitClient as the DocSource (no DB, no container).
 */

const WS = 'ws-1';
const REPO = { id: 'repo-1', owner: 'acme', name: 'api' };

const FILES: Record<string, string> = {
  'README.md': '# Readme',
  'specs/a.md': 'Spec A text',
  'docs/b.md': 'Doc B text',
  'docs/c.md': 'Doc C text',
  'docs/boom.md': 'never readable',
  // link texts, as `git show HEAD:<link>` returns them
  'out.md': '../../etc/passwd',
  'CLAUDE.md': 'README.md',
};
const blob = (path: string): GitTreeEntry => ({
  path,
  mode: '100644',
  size: FILES[path]!.length,
});
const TREE: GitTreeEntry[] = [
  blob('README.md'),
  blob('specs/a.md'),
  blob('docs/b.md'),
  blob('docs/c.md'),
  blob('docs/boom.md'),
  { path: 'out.md', mode: '120000', size: 16 },
  { path: 'CLAUDE.md', mode: '120000', size: 9 },
];

/** MockGitClient whose `showFile` throws for one path (an unreadable document). */
class FlakyGit extends MockGitClient {
  constructor(
    opts: ConstructorParameters<typeof MockGitClient>[0],
    private readonly failPath: string,
  ) {
    super(opts);
  }
  override async showFile(repo: RepoRef, ref: string, path: string): Promise<string | null> {
    if (path === this.failPath) {
      this.shown.push({ ref, path });
      throw new Error('fatal: bad object');
    }
    return super.showFile(repo, ref, path);
  }
}

/** Skills: `sk-sec` is effective for ag-1/ag-2; `sk-off` is linked but disabled (L02 rule). */
const SKILL_DOCS: Record<string, string[]> = {
  'sk-sec': ['docs/b.md'],
  'sk-off': ['docs/c.md'],
};
const EFFECTIVE: Record<string, { id: string; name: string }[]> = {
  'ag-1': [{ id: 'sk-sec', name: 'Security' }],
  'ag-2': [{ id: 'sk-sec', name: 'Security' }],
  'ag-3': [],
};

class FakeContextRepo implements ContextRepo {
  setAgentCalls: { ws: string; agentId: string; repoId: string; paths: string[] }[] = [];
  setSkillCalls: { ws: string; skillId: string; repoId: string; paths: string[] }[] = [];
  constructor(public agentDocsMap: Record<string, string[]>) {}

  async findRepo(ws: string, repoId: string) {
    return ws === WS && repoId === REPO.id ? REPO : null;
  }
  async agentExists(ws: string, id: string) {
    return ws === WS && id in EFFECTIVE;
  }
  async skillExists(ws: string, id: string) {
    return ws === WS && id in SKILL_DOCS;
  }
  async agentDocs(ws: string, agentId: string, repoId: string) {
    if (ws !== WS || repoId !== REPO.id) return [];
    return [...(this.agentDocsMap[agentId] ?? [])];
  }
  async skillDocs(ws: string, skillId: string, repoId: string) {
    if (ws !== WS || repoId !== REPO.id) return [];
    return [...(SKILL_DOCS[skillId] ?? [])];
  }
  async setAgentDocs(ws: string, agentId: string, repoId: string, paths: string[]) {
    this.setAgentCalls.push({ ws, agentId, repoId, paths: [...paths] });
    this.agentDocsMap[agentId] = [...paths];
  }
  async setSkillDocs(ws: string, skillId: string, repoId: string, paths: string[]) {
    this.setSkillCalls.push({ ws, skillId, repoId, paths: [...paths] });
  }
  async skillDocsFor(ws: string, skillIds: string[], repoId: string) {
    const m = new Map<string, string[]>();
    if (ws !== WS || repoId !== REPO.id) return m;
    for (const id of skillIds) m.set(id, [...(SKILL_DOCS[id] ?? [])]);
    return m;
  }
  async agentIds(ws: string) {
    return ws === WS ? Object.keys(EFFECTIVE) : [];
  }
  async agentDocsByRepo(ws: string, repoId: string) {
    const m = new Map<string, string[]>();
    if (ws !== WS || repoId !== REPO.id) return m;
    for (const [id, paths] of Object.entries(this.agentDocsMap)) m.set(id, [...paths]);
    return m;
  }
}

const skills: EffectiveSkillsSource = {
  effectiveSkills: async (agentId: string) => EFFECTIVE[agentId] ?? [],
};

function setup(
  agentDocs: Record<string, string[]> = {},
  git: MockGitClient = new MockGitClient({ filesAtRef: FILES, tree: TREE }),
) {
  const repo = new FakeContextRepo(agentDocs);
  const svc = new ProjectContextService({ repo, skills, git });
  return { svc, repo, git };
}

describe('ProjectContextService', () => {
  it('listDocs: no local clone (null tree) → ConflictError (AC-8)', async () => {
    const { svc } = setup({}, new MockGitClient({ noClone: true }));
    await expect(svc.listDocs(WS, REPO.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([['../../etc/passwd'], ['docs/undiscovered.md']])(
    'setAgentDocs: %s is not a discovered document → ValidationError, nothing stored (AC-40, EC-20)',
    async (bad) => {
      const { svc, repo } = setup({ 'ag-1': ['specs/a.md'] });
      await expect(
        svc.setAgentDocs(WS, 'ag-1', REPO.id, ['specs/a.md', bad]),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.setAgentCalls).toHaveLength(0);
      expect(repo.agentDocsMap['ag-1']).toEqual(['specs/a.md']);
    },
  );

  it('setAgentDocs: duplicate paths → ValidationError, nothing stored', async () => {
    const { svc, repo } = setup({ 'ag-1': [] });
    await expect(
      svc.setAgentDocs(WS, 'ag-1', REPO.id, ['specs/a.md', 'specs/a.md']),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setAgentCalls).toHaveLength(0);
  });

  it('setAgentDocs: a stored path that is now missing is accepted on reorder (AC-21)', async () => {
    const { svc, repo } = setup({ 'ag-1': ['gone.md', 'specs/a.md'] });
    const view = await svc.setAgentDocs(WS, 'ag-1', REPO.id, ['specs/a.md', 'gone.md']);
    expect(repo.setAgentCalls).toEqual([
      { ws: WS, agentId: 'ag-1', repoId: REPO.id, paths: ['specs/a.md', 'gone.md'] },
    ]);
    expect(view.rows.find((r) => r.path === 'gone.md')?.state).toBe('missing');
    expect(view.attached).toBe(2);
  });

  it('forRun: own docs then effective-skill docs; unreadable paths are skipped (AC-30, AC-35, EC-8)', async () => {
    const git = new FlakyGit({ filesAtRef: FILES, tree: TREE }, 'docs/boom.md');
    const { svc } = setup({ 'ag-1': ['specs/a.md', 'gone.md', 'docs/boom.md'] }, git);
    const ctx = await svc.forRun(WS, 'ag-1', REPO.id);
    expect(ctx.injected.map((d) => ({ path: d.path, text: d.text }))).toEqual([
      { path: 'specs/a.md', text: 'Spec A text' },
      { path: 'docs/b.md', text: 'Doc B text' },
    ]);
    expect([...ctx.skipped].sort()).toEqual(['docs/boom.md', 'gone.md']);
    expect(ctx.omitted).toEqual([]);
    // the disabled skill's document is not inherited
    expect(ctx.injected.some((d) => d.path === 'docs/c.md')).toBe(false);
  });

  it("forRun: reads documents at ref 'HEAD' — the default branch as of the last sync (AC-34)", async () => {
    const { svc, git } = setup({ 'ag-1': ['specs/a.md'] });
    await svc.forRun(WS, 'ag-1', REPO.id);
    expect(git.shown.map((s) => s.path)).toContain('specs/a.md');
    expect(git.shown.every((s) => s.ref === 'HEAD')).toBe(true);
    expect(git.listed.every((l) => l.ref === 'HEAD')).toBe(true);
  });

  it('never lists or reads a symlink pointing outside the clone (AC-41)', async () => {
    const { svc, git } = setup({ 'ag-1': ['out.md', 'specs/a.md'] });

    const docs = await svc.listDocs(WS, REPO.id);
    expect(docs.map((d) => d.path)).not.toContain('out.md');

    const ctx = await svc.forRun(WS, 'ag-1', REPO.id);
    expect(ctx.injected.map((d) => d.path)).not.toContain('out.md');
    expect(ctx.injected.some((d) => d.text.includes('etc/passwd'))).toBe(false);

    const outside = git.shown.filter((s) => s.path.startsWith('/') || s.path.split('/').includes('..'));
    expect(outside).toEqual([]);
  });

  it("listDocs: used_by counts the agents with the document in their effective list (AC-5, Q4)", async () => {
    const { svc } = setup({ 'ag-1': ['specs/a.md'], 'ag-2': [], 'ag-3': ['specs/a.md'] });
    const docs = await svc.listDocs(WS, REPO.id);
    const usedBy = Object.fromEntries(docs.map((d) => [d.path, d.used_by]));
    expect(usedBy['specs/a.md']).toBe(2); // ag-1, ag-3 own
    expect(usedBy['docs/b.md']).toBe(2); // ag-1, ag-2 via Security
    expect(usedBy['docs/c.md']).toBe(0); // only via the disabled skill
    expect(usedBy['README.md']).toBe(0);
  });
});

/**
 * G1 — T (`ContextAttachments.tokens`, AC-17/AC-24) counts the injected texts
 * AFTER the limits: a doc over 20,000 chars counts as its first 20,000 chars plus
 * the truncation marker; a doc past the 60,000-char budget doesn't count.
 * The marker for a 2x,xxx-char doc is
 * "\n\n[… truncated by DevDigest: first 20,000 of 2x,xxx characters]" = 63 chars,
 * so a truncated doc is 20,063 chars → ceil(20,063 / 4) = 5,016 tokens.
 */
describe('ProjectContextService — T after the limits (AC-17, AC-24, AC-36, AC-37)', () => {
  const BIG: Record<string, string> = {
    'docs/big1.md': 'a'.repeat(25_000),
    'docs/big2.md': 'b'.repeat(30_000),
    'docs/big3.md': 'c'.repeat(21_000),
  };
  const files = { ...FILES, ...BIG };
  const tree: GitTreeEntry[] = [
    ...TREE,
    ...Object.entries(BIG).map(([path, text]) => ({ path, mode: '100644', size: text.length })),
  ];

  class BigSkillRepo extends FakeContextRepo {
    override async skillExists(ws: string, id: string) {
      return ws === WS && id === 'sk-big';
    }
    override async skillDocs(ws: string, skillId: string, repoId: string) {
      if (ws !== WS || repoId !== REPO.id || skillId !== 'sk-big') return [];
      return ['docs/big1.md', 'docs/big2.md', 'docs/big3.md', 'specs/a.md'];
    }
  }

  it('agentView: tokens = truncated own doc + own doc + inherited doc (5016 + 3 + 3)', async () => {
    const git = new MockGitClient({ filesAtRef: files, tree });
    // ag-1 inherits docs/b.md ("Doc B text", 10 chars) via the Security skill
    const { svc } = setup({ 'ag-1': ['docs/big1.md', 'specs/a.md'] }, git);
    const view = await svc.agentView(WS, 'ag-1', REPO.id);
    // big1: 25,000 → 20,063 chars → 5,016; "Spec A text" 11 → 3; "Doc B text" 10 → 3
    expect(view.tokens).toBe(5022);
  });

  it('skillView: three truncated docs fill the 60,000 budget exactly; the next one is omitted (3 × 5016)', async () => {
    const repo = new BigSkillRepo({});
    const git = new MockGitClient({ filesAtRef: files, tree });
    const svc = new ProjectContextService({ repo, skills, git });
    const view = await svc.skillView(WS, 'sk-big', REPO.id);
    // 3 × 20,000 counted chars = 60,000 (fits); specs/a.md would exceed → not counted
    expect(view.tokens).toBe(15048);
    expect(view.attached).toBe(4);
  });
});
