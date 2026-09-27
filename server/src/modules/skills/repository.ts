import { and, asc, eq } from 'drizzle-orm';
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { NewSkill, SkillPatch, SkillsRepo } from './ports.js';

/**
 * L02 — skills data-access. Owns `skills` + `skill_versions`; the agent side of
 * `agent_skills` stays in the agents repository. Workspace-scoped throughout.
 */

type SkillRow = typeof t.skills.$inferSelect;

function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

export class SkillsRepository implements SkillsRepo {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toSkillDto(row) : null;
  }

  async findByName(workspaceId: string, name: string): Promise<Skill | null> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row ? toSkillDto(row) : null;
  }

  async insert(workspaceId: string, skill: NewSkill): Promise<Skill> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ workspaceId, ...skill, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: skill.body });
      return toSkillDto(row!);
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    bumpTo?: number,
  ): Promise<Skill | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ ...patch, ...(bumpTo !== undefined ? { version: bumpTo } : {}) })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return null;
      if (bumpTo !== undefined) {
        await tx.insert(t.skillVersions).values({ skillId: row.id, version: bumpTo, body: row.body });
      }
      return toSkillDto(row);
    });
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
