import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPull, BlastRepo } from './ports.js';

/** Blast data-access: `pull_requests` + `pr_files`, workspace-scoped, read-only. */
export class BlastRepository implements BlastRepo {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BlastPull | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ?? null;
  }

  async findPullByNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<BlastPull | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row ?? null;
  }

  async listChangedFiles(workspaceId: string, prId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ path: t.prFiles.path })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return rows.map((r) => r.path);
  }
}
