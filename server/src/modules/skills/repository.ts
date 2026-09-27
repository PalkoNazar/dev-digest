import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { NewSkill, SkillPatch, SkillsRepo } from './ports.js';

/**
 * L02 — skills data-access. Owns `skills` + `skill_versions`; the agent side of
 * `agent_skills` stays in the agents repository. Workspace-scoped throughout.
 */

type SkillRow = typeof t.skills.$inferSelect;

function toSkillDto(row: SkillRow, agentCount?: number): Skill {
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
    ...(agentCount !== undefined ? { agent_count: agentCount } : {}),
  };
}

export class SkillsRepository implements SkillsRepo {
  constructor(private readonly db: Db) {}

  /** Skills matching `where`, each with the number of agents it is attached to. */
  private async withAgentCounts(where: SQL | undefined): Promise<Skill[]> {
    const rows = await this.db
      .select({ skill: t.skills, agents: count(t.agentSkills.agentId) })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(where)
      .groupBy(t.skills.id)
      .orderBy(asc(t.skills.name));
    return rows.map((r) => toSkillDto(r.skill, r.agents));
  }

  list(workspaceId: string): Promise<Skill[]> {
    return this.withAgentCounts(eq(t.skills.workspaceId, workspaceId));
  }

  async get(workspaceId: string, id: string): Promise<Skill | null> {
    const [skill] = await this.withAgentCounts(
      and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)),
    );
    return skill ?? null;
  }

  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => ({
      version: r.version,
      body: r.body,
      created_at: r.createdAt.toISOString(),
    }));
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
