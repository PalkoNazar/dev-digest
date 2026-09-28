import type {
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillStats,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { STATS_WINDOW_DAYS } from './constants.js';
import { buildImportPreview, toSkillStats } from './helpers.js';
import type { SkillsDeps } from './ports.js';

/**
 * L02 — skills use cases. A skill is text + config only (name, description,
 * type, markdown body, enabled): nothing in it is ever executed. The DB is the
 * source of truth; a body change bumps the version and keeps the old body in
 * `skill_versions`.
 */
export class SkillsService {
  constructor(private readonly deps: SkillsDeps) {}

  list(workspaceId: string): Promise<Skill[]> {
    return this.deps.repo.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.deps.repo.get(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  async create(workspaceId: string, input: SkillCreate): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const source = input.source ?? 'manual';
    return this.deps.repo.insert(workspaceId, {
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      // An imported skill is someone else's instructions — it starts disabled
      // unless the user explicitly enabled it in the import preview.
      enabled: input.enabled ?? source === 'manual',
    });
  }

  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill> {
    const existing = await this.get(workspaceId, id);
    if (patch.name !== undefined && patch.name !== existing.name) {
      await this.assertNameFree(workspaceId, patch.name);
    }
    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    // The repository increments the version atomically (concurrent edits can't collide).
    const updated = await this.deps.repo.update(workspaceId, id, patch, bodyChanged);
    if (!updated) throw new NotFoundError('Skill not found');
    return updated;
  }

  /** Body history of a skill, newest first. */
  async versions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.get(workspaceId, id);
    return this.deps.repo.listVersions(workspaceId, id);
  }

  /** Stats tab: agents using the skill, pull frequency and finding outcomes. */
  async stats(workspaceId: string, id: string, now = new Date()): Promise<SkillStats> {
    await this.get(workspaceId, id);
    const since = new Date(now.getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const counts = await this.deps.repo.usage(workspaceId, id, since);
    return toSkillStats(counts, STATS_WINDOW_DAYS);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.delete(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  /** Parse an uploaded `.md` / `.zip` into a preview. Stores nothing. */
  async previewImport(
    workspaceId: string,
    filename: string,
    contentBase64: string,
  ): Promise<SkillImportPreview> {
    const preview = buildImportPreview(filename, Buffer.from(contentBase64, 'base64'));
    if (await this.deps.repo.findByName(workspaceId, preview.name)) {
      preview.warnings.push(`A skill named "${preview.name}" already exists — rename it before saving.`);
    }
    return preview;
  }

  private async assertNameFree(workspaceId: string, name: string): Promise<void> {
    if (await this.deps.repo.findByName(workspaceId, name)) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }
}
