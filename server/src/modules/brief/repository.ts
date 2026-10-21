import { and, eq } from 'drizzle-orm';
import { FEATURE_MODELS, FeatureModelChoice, PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import { FEATURE_ID } from './constants.js';
import type { BriefRepo } from './ports.js';
import type { BriefFile, BriefSnapshot, StoredBrief } from './types.js';

/**
 * PR Brief data access (plan S5): `pull_requests` (own `workspace_id`), `pr_files`
 * and `pr_brief` (scoped through their PR), `settings` (own `workspace_id`).
 */
export class BriefRepository implements BriefRepo {
  constructor(private readonly db: Db) {}

  async readBrief(
    workspaceId: string,
    prId: string,
  ): Promise<{ headSha: string; brief: PrBrief | null } | null> {
    const [row] = await this.db
      .select({ headSha: t.pullRequests.headSha, json: t.prBrief.json })
      .from(t.pullRequests)
      .leftJoin(t.prBrief, eq(t.prBrief.prId, t.pullRequests.id))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return null;
    const parsed = row.json == null ? null : PrBrief.safeParse(row.json);
    return { headSha: row.headSha, brief: parsed?.success ? parsed.data : null };
  }

  async snapshot(workspaceId: string, prId: string): Promise<BriefSnapshot | null> {
    // `persistDetail` writes pr_files + detail_head_sha in one tx; reading both in
    // one repeatable-read tx gives one consistent state (review #1).
    return this.db.transaction(
      async (tx) => {
        const [row] = await tx
          .select({ pull: t.pullRequests, owner: t.repos.owner, name: t.repos.name })
          .from(t.pullRequests)
          .leftJoin(
            t.repos,
            and(eq(t.repos.id, t.pullRequests.repoId), eq(t.repos.workspaceId, workspaceId)),
          )
          .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
        if (!row) return null;
        const files: BriefFile[] = await tx
          .select({
            path: t.prFiles.path,
            additions: t.prFiles.additions,
            deletions: t.prFiles.deletions,
            patch: t.prFiles.patch,
          })
          .from(t.prFiles)
          .where(eq(t.prFiles.prId, prId));
        const { pull } = row;
        return {
          pull: {
            id: pull.id,
            repoId: pull.repoId,
            number: pull.number,
            title: pull.title,
            body: pull.body,
            branch: pull.branch,
            headSha: pull.headSha,
            detailHeadSha: pull.detailHeadSha,
            repo: row.owner !== null && row.name !== null ? { owner: row.owner, name: row.name } : null,
          },
          files,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  async saveBrief(workspaceId: string, prId: string, brief: PrBrief): Promise<StoredBrief | null> {
    const parsed = PrBrief.safeParse(brief);
    if (!parsed.success) {
      // Only issue paths/codes — never the brief text (it is model output).
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code }));
      throw new AppError('invalid_brief', 'The generated brief does not match the contract', 500, { issues });
    }
    const json = parsed.data;
    return this.db.transaction(async (tx) => {
      const [pr] = await tx
        .select({ headSha: t.pullRequests.headSha })
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
      if (!pr) return null;
      await tx
        .insert(t.prBrief)
        .values({ prId, json })
        .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
      return { brief: json, headSha: pr.headSha };
    });
  }

  /**
   * Settings → Feature Models override for `risk_brief`, else the registry default.
   * Read here (one key of the settings bag) because modules don't import each other.
   */
  async featureModel(workspaceId: string): Promise<FeatureModelChoice> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    const chosen = (row?.value as Record<string, unknown> | null)?.[FEATURE_ID];
    const parsed = FeatureModelChoice.safeParse(chosen);
    if (parsed.success) return parsed.data;
    const def = FEATURE_MODELS.find((f) => f.id === FEATURE_ID)!;
    return { provider: def.defaultProvider, model: def.defaultModel };
  }
}
