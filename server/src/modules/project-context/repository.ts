import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextRepo, ContextRepoRef } from './ports.js';

/**
 * L05 Project Context data-access: `agent_context_docs` + `skill_context_docs`.
 * Attachment rows have no `workspace_id`; every query joins the parent
 * agent/skill (and checks the repo) on `workspace_id`.
 */
export class ProjectContextRepository implements ContextRepo {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ContextRepoRef | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row !== undefined;
  }

  async agentDocs(workspaceId: string, agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentContextDocs.agentId, agentId),
          eq(t.agentContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.agentContextDocs.order));
    return rows.map((r) => r.path);
  }

  async skillDocs(workspaceId: string, skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skillContextDocs.skillId, skillId),
          eq(t.skillContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  async setAgentDocs(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Lock the agent row: concurrent saves of one agent run one after another
      // (last request wins) instead of interleaving delete/insert on the PK.
      const [agent] = await tx
        .select({ id: t.agents.id })
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .for('update');
      if (!agent) return;
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, order) => ({ agentId, repoId, path, order })));
      }
    });
  }

  async setSkillDocs(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [skill] = await tx
        .select({ id: t.skills.id })
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
        .for('update');
      if (!skill) return;
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, order) => ({ skillId, repoId, path, order })));
      }
    });
  }

  async skillDocsFor(
    workspaceId: string,
    skillIds: string[],
    repoId: string,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          inArray(t.skillContextDocs.skillId, skillIds),
          eq(t.skillContextDocs.repoId, repoId),
        ),
      )
      .orderBy(asc(t.skillContextDocs.skillId), asc(t.skillContextDocs.order));
    for (const r of rows) {
      const list = out.get(r.skillId) ?? [];
      list.push(r.path);
      out.set(r.skillId, list);
    }
    return out;
  }

  async agentIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows.map((r) => r.id);
  }

  async agentDocsByRepo(workspaceId: string, repoId: string): Promise<Map<string, string[]>> {
    const rows = await this.db
      .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.agentId), asc(t.agentContextDocs.order));
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const list = out.get(r.agentId) ?? [];
      list.push(r.path);
      out.set(r.agentId, list);
    }
    return out;
  }

  async attachedPathsForRepo(workspaceId: string, repoId: string): Promise<string[]> {
    const [agentRows, skillRows] = await Promise.all([
      this.db
        .selectDistinct({ path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.repoId, repoId))),
      this.db
        .selectDistinct({ path: t.skillContextDocs.path })
        .from(t.skillContextDocs)
        .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skillContextDocs.repoId, repoId))),
    ]);
    const paths = new Set([...agentRows, ...skillRows].map((r) => r.path));
    // Code-unit order (not the DB collation), so the order is the same everywhere.
    return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
