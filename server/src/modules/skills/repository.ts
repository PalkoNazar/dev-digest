import { and, asc, count, desc, eq, gte, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { NewSkill, SkillPatch, SkillsRepo, SkillUsageCounts } from './ports.js';

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

  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[]> {
    // skill_versions has no workspace column — scope through the parent skill.
    const rows = await this.db
      .select({
        version: t.skillVersions.version,
        body: t.skillVersions.body,
        createdAt: t.skillVersions.createdAt,
      })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skills.workspaceId, workspaceId)))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => ({
      version: r.version,
      body: r.body,
      created_at: r.createdAt.toISOString(),
    }));
  }

  async usage(workspaceId: string, skillId: string, since: Date): Promise<SkillUsageCounts> {
    const agents = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        link_enabled: t.agentSkills.enabled,
        agent_enabled: t.agents.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agentSkills.order), asc(t.agents.name));

    // Finished runs in the window, and whether each one had this skill in its prompt
    // (the run trace records `skills_used: [{ id, name, version }]`).
    const pulled = sql<boolean>`coalesce(${t.runTraces.trace} -> 'skills_used' @> ${JSON.stringify([
      { id: skillId },
    ])}::jsonb, false)`;
    const runs = await this.db
      .select({ id: t.agentRuns.id, agentId: t.agentRuns.agentId, pulled })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    const linked = new Set(agents.map((a) => a.id));
    const ofLinked = runs.filter((r) => r.agentId !== null && linked.has(r.agentId));
    const withSkill = runs.filter((r) => r.pulled).map((r) => r.id);

    const byCategory =
      withSkill.length === 0
        ? []
        : await this.db
            .select({
              category: t.findings.category,
              count: count(),
              accepted: count(t.findings.acceptedAt),
              dismissed: count(t.findings.dismissedAt),
            })
            .from(t.findings)
            .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
            .where(
              and(
                eq(t.reviews.workspaceId, workspaceId),
                isNotNull(t.reviews.runId),
                inArray(t.reviews.runId, withSkill),
              ),
            )
            .groupBy(t.findings.category);

    return {
      agents,
      runsTotal: ofLinked.length,
      runsWithSkill: ofLinked.filter((r) => r.pulled).length,
      findings: byCategory.reduce((n, c) => n + c.count, 0),
      accepted: byCategory.reduce((n, c) => n + c.accepted, 0),
      dismissed: byCategory.reduce((n, c) => n + c.dismissed, 0),
      byCategory: byCategory.map((c) => ({ category: c.category, count: c.count })),
    };
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
