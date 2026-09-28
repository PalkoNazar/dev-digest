import { describe, it, expect, beforeEach } from 'vitest';
import type { Skill } from '@devdigest/shared';
import { SkillsService } from '../src/modules/skills/service.js';
import type { NewSkill, SkillPatch, SkillsRepo } from '../src/modules/skills/ports.js';
import { ConflictError, NotFoundError } from '../src/platform/errors.js';

/** In-memory SkillsRepo: enough to test the use-case rules without a DB. */
class FakeSkillsRepo implements SkillsRepo {
  skills = new Map<string, Skill & { ws: string }>();
  versions: { skillId: string; version: number; body: string }[] = [];
  private seq = 0;

  async list(ws: string) {
    return [...this.skills.values()].filter((s) => s.ws === ws);
  }
  async get(ws: string, id: string) {
    const s = this.skills.get(id);
    return s && s.ws === ws ? s : null;
  }
  async findByName(ws: string, name: string) {
    return (await this.list(ws)).find((s) => s.name === name) ?? null;
  }
  async insert(ws: string, n: NewSkill) {
    const s = { ...n, id: `s${++this.seq}`, version: 1, evidence_files: null, ws };
    this.skills.set(s.id, s);
    this.versions.push({ skillId: s.id, version: 1, body: n.body });
    return s;
  }
  async update(ws: string, id: string, patch: SkillPatch, bumpVersion = false) {
    const s = await this.get(ws, id);
    if (!s) return null;
    Object.assign(s, patch, bumpVersion ? { version: s.version + 1 } : {});
    if (bumpVersion) this.versions.push({ skillId: id, version: s.version, body: s.body });
    return s;
  }
  async listVersions(ws: string, skillId: string) {
    if (!(await this.get(ws, skillId))) return [];
    return this.versions
      .filter((v) => v.skillId === skillId)
      .map((v) => ({ version: v.version, body: v.body, created_at: '' }))
      .reverse();
  }
  async usage() {
    return {
      agents: [{ id: 'a1', name: 'Test Quality', link_enabled: true, agent_enabled: true }],
      runsTotal: 4,
      runsWithSkill: 3,
      findings: 5,
      accepted: 3,
      dismissed: 1,
      byCategory: [
        { category: 'bug', count: 1 },
        { category: 'test', count: 4 },
      ],
    };
  }
  async delete(ws: string, id: string) {
    return (await this.get(ws, id)) ? this.skills.delete(id) : false;
  }
}

const input = {
  name: 'branch-coverage',
  description: 'When a diff adds a branch, flag it if no test covers it.',
  type: 'rubric' as const,
  body: 'Every new if/else needs a test.',
};

describe('SkillsService', () => {
  let repo: FakeSkillsRepo;
  let service: SkillsService;
  beforeEach(() => {
    repo = new FakeSkillsRepo();
    service = new SkillsService({ repo });
  });

  it('manual skills start enabled; imported ones start disabled unless enabled explicitly', async () => {
    expect((await service.create('w', input)).enabled).toBe(true);
    const imported = await service.create('w', { ...input, name: 'b', source: 'imported_file' });
    expect(imported).toMatchObject({ source: 'imported_file', enabled: false });
    const vetted = await service.create('w', {
      ...input,
      name: 'c',
      source: 'imported_file',
      enabled: true,
    });
    expect(vetted.enabled).toBe(true);
  });

  it('rejects a duplicate name in the same workspace, allows it in another', async () => {
    await service.create('w', input);
    await expect(service.create('w', input)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.create('other', input)).resolves.toBeTruthy();
  });

  it('a body change bumps the version and records it; other edits do not', async () => {
    const s = await service.create('w', input);
    const toggled = await service.update('w', s.id, { enabled: false, description: 'Do Y.' });
    expect(toggled.version).toBe(1);
    const sameBody = await service.update('w', s.id, { body: input.body });
    expect(sameBody.version).toBe(1);
    const edited = await service.update('w', s.id, { body: 'New rule.' });
    expect(edited.version).toBe(2);
    expect(repo.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('versions are newest first and scoped to the workspace', async () => {
    const s = await service.create('w', input);
    await service.update('w', s.id, { body: 'v2 body' });
    expect((await service.versions('w', s.id)).map((v) => v.version)).toEqual([2, 1]);
    await expect(service.versions('x', s.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stats derive rates from usage counts and sort categories', async () => {
    const s = await service.create('w', input);
    const stats = await service.stats('w', s.id);
    expect(stats).toMatchObject({
      window_days: 30,
      runs_total: 4,
      runs_with_skill: 3,
      pull_rate: 0.75,
      findings: 5,
      accept_rate: 0.75,
    });
    expect(stats.by_category.map((c) => c.category)).toEqual(['test', 'bug']);
    await expect(service.stats('x', s.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('renaming onto an existing name is a conflict', async () => {
    await service.create('w', input);
    const other = await service.create('w', { ...input, name: 'other' });
    await expect(service.update('w', other.id, { name: input.name })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('get/update/delete across workspaces is not found', async () => {
    const s = await service.create('w', input);
    await expect(service.get('x', s.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update('x', s.id, { body: 'z' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete('x', s.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('import preview warns when the name is taken and stores nothing', async () => {
    await service.create('w', input);
    const md = `---\nname: branch-coverage\ndescription: d\n---\nbody`;
    const p = await service.previewImport('w', 'x.md', Buffer.from(md).toString('base64'));
    expect(p.warnings.join(' ')).toMatch(/already exists/);
    expect(repo.skills.size).toBe(1);
  });
});
