import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type PrIntentRecord,
} from '@devdigest/shared';
import type { IntentPull, IntentRecordWrite, StoredIntent } from '../intent/types.js';

const FEATURE_ID = 'review_intent' as const;

type PrIntentRow = typeof t.prIntent.$inferSelect;

/** Row → contract. The `intent` column holds the contract's `summary`. */
function toIntentRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    summary: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    head_sha: row.headSha,
    confidence: row.confidence,
    mode: row.mode,
    missing_context: row.missingContext,
    context_gaps: row.contextGaps,
    sources_used: row.sourcesUsed,
    unresolved_refs: row.unresolvedRefs,
    prompt_components: row.promptComponents,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    fallback_reason: row.fallbackReason,
    updated_at: row.updatedAt.toISOString(),
  };
}

// ---- intent (workspace-scoped through pull_requests.workspace_id) ----------

/** The stored intent of a PR in the workspace, or null (not derived / other workspace). */
export async function getIntentRecord(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<StoredIntent | null> {
  const [row] = await db
    .select({ intent: t.prIntent })
    .from(t.prIntent)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prIntent.prId, prId)));
  if (!row) return null;
  return { record: toIntentRecord(row.intent), inputHash: row.intent.inputHash };
}

/**
 * Upsert the PR's intent. Returns null (and writes nothing) when the PR is not
 * in the workspace.
 */
export async function saveIntentRecord(
  db: Db,
  workspaceId: string,
  prId: string,
  rec: IntentRecordWrite,
): Promise<PrIntentRecord | null> {
  const [pull] = await db
    .select({ id: t.pullRequests.id })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  if (!pull) return null;

  const values = {
    intent: rec.summary,
    inScope: rec.in_scope,
    outOfScope: rec.out_of_scope,
    confidence: rec.confidence,
    mode: rec.mode,
    missingContext: rec.missing_context,
    contextGaps: rec.context_gaps,
    sourcesUsed: rec.sources_used,
    unresolvedRefs: rec.unresolved_refs,
    promptComponents: rec.prompt_components,
    headSha: rec.head_sha,
    inputHash: rec.input_hash,
    provider: rec.provider,
    model: rec.model,
    tokensIn: rec.tokens_in,
    tokensOut: rec.tokens_out,
    costUsd: rec.cost_usd,
    fallbackReason: rec.fallback_reason,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(t.prIntent)
    .values({ prId: pull.id, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
    .returning();
  return row ? toIntentRecord(row) : null;
}

/** The PR fields + repo the classifier needs, or null when the PR is not in the workspace. */
export async function getPullForIntent(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<IntentPull | null> {
  const [row] = await db
    .select({ pull: t.pullRequests, owner: t.repos.owner, name: t.repos.name })
    .from(t.pullRequests)
    .leftJoin(
      t.repos,
      and(eq(t.repos.id, t.pullRequests.repoId), eq(t.repos.workspaceId, workspaceId)),
    )
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  if (!row) return null;
  const { pull } = row;
  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    body: pull.body,
    branch: pull.branch,
    base: pull.base,
    headSha: pull.headSha,
    repo: row.owner !== null && row.name !== null ? { owner: row.owner, name: row.name } : null,
  };
}

/** The workspace's "PR Review · Intent" model choice, else the registry default. */
export async function intentFeatureModel(
  db: Db,
  workspaceId: string,
): Promise<FeatureModelChoice> {
  const [row] = await db
    .select({ value: t.settings.value })
    .from(t.settings)
    .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
  const chosen = (row?.value as Record<string, unknown> | null)?.[FEATURE_ID];
  const parsed = FeatureModelChoice.safeParse(chosen);
  if (parsed.success) return parsed.data;
  const def = FEATURE_MODELS.find((f) => f.id === FEATURE_ID)!;
  return { provider: def.defaultProvider, model: def.defaultModel };
}
