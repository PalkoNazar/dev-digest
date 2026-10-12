import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  OnboardingSkeletonReason,
  OnboardingTour,
  type OnboardingGeneration,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ConflictError } from '../../platform/errors.js';
import { FEATURE_ID, INDEXING_FRESH_MS, INDEXING_JOB_KINDS } from './constants.js';
import type { CompleteOutcome, OnboardingRepo, OnboardingTarget } from './ports.js';

/**
 * Onboarding Tour data access (plan S10): `onboarding_generations` (scoped by its
 * own `workspace_id`), `onboarding` (scoped through `repos.workspace_id`) and the
 * `jobs` rows of clone/index work (scoped by `jobs.workspace_id`).
 */

/** The partial unique index that allows one `running` generation per repo. */
const ONE_RUNNING_CONSTRAINT = 'onboarding_generations_one_running_uq';
const DETAIL_MAX_CHARS = 2000;

type PgError = { code?: string; constraint_name?: string; cause?: PgError } | null;

/** unique_violation (23505) on ONE_RUNNING_CONSTRAINT, from postgres-js or wrapped by Drizzle. */
function isOneRunningConflict(err: unknown): boolean {
  const e = err as PgError;
  const pg = e?.code ? e : e?.cause;
  return pg?.code === '23505' && pg.constraint_name === ONE_RUNNING_CONSTRAINT;
}

type GenerationRow = typeof t.onboardingGenerations.$inferSelect;

function toGenerationDto(row: GenerationRow): OnboardingGeneration {
  const reason = OnboardingSkeletonReason.safeParse(row.reason);
  return {
    id: row.id,
    status: row.status,
    outcome: row.outcome ?? null,
    reason: reason.success ? reason.data : null,
    detail: row.detail,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

export class OnboardingRepository implements OnboardingRepo {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<OnboardingTarget | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /**
   * Settings → Feature Models override for `onboarding`, else the registry default.
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

  async latestGeneration(workspaceId: string, repoId: string): Promise<OnboardingGeneration | null> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(
        and(
          eq(t.onboardingGenerations.workspaceId, workspaceId),
          eq(t.onboardingGenerations.repoId, repoId),
        ),
      )
      .orderBy(desc(t.onboardingGenerations.startedAt))
      .limit(1);
    return row ? toGenerationDto(row) : null;
  }

  async createGeneration(workspaceId: string, repoId: string): Promise<OnboardingGeneration> {
    try {
      const [row] = await this.db
        .insert(t.onboardingGenerations)
        .values({ workspaceId, repoId, status: 'running' })
        .returning();
      return toGenerationDto(row!);
    } catch (err) {
      // the service checks first; this closes the race between two concurrent starts (AC-14)
      if (isOneRunningConflict(err)) throw new ConflictError('An onboarding tour generation is already running');
      throw err;
    }
  }

  async failGeneration(workspaceId: string, generationId: string, detail: string): Promise<void> {
    await this.db
      .update(t.onboardingGenerations)
      .set({ status: 'failed', detail: detail.slice(0, DETAIL_MAX_CHARS), finishedAt: new Date() })
      .where(
        and(
          eq(t.onboardingGenerations.workspaceId, workspaceId),
          eq(t.onboardingGenerations.id, generationId),
          eq(t.onboardingGenerations.status, 'running'),
        ),
      );
  }

  async completeGeneration(
    workspaceId: string,
    generationId: string,
    tour: OnboardingTour,
  ): Promise<CompleteOutcome> {
    return this.db.transaction(async (tx) => {
      const finishedAt = new Date();
      // 1. Only a still-running generation may write (AC-21, AC-23).
      const [gen] = await tx
        .update(t.onboardingGenerations)
        .set({ status: 'done', finishedAt })
        .where(
          and(
            eq(t.onboardingGenerations.workspaceId, workspaceId),
            eq(t.onboardingGenerations.id, generationId),
            eq(t.onboardingGenerations.status, 'running'),
          ),
        )
        .returning({ repoId: t.onboardingGenerations.repoId });
      if (!gen) return 'discarded';

      const detail = tour.reason_detail?.slice(0, DETAIL_MAX_CHARS) ?? null;

      // 2. A skeleton never replaces a stored LLM tour (AC-77, AC-78).
      if (tour.kind === 'skeleton') {
        const [stored] = await tx
          .select({ kind: sql<string | null>`${t.onboarding.json}->>'kind'` })
          .from(t.onboarding)
          .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
          .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.onboarding.repoId, gen.repoId)));
        if (stored?.kind === 'llm') {
          await tx
            .update(t.onboardingGenerations)
            .set({ outcome: 'kept_previous', reason: tour.skeleton_reason, detail })
            .where(
              and(
                eq(t.onboardingGenerations.workspaceId, workspaceId),
                eq(t.onboardingGenerations.id, generationId),
              ),
            );
          return 'kept_previous';
        }
      }

      // 3. Store (AC-16). The repo belongs to the workspace: the generation row says so.
      await tx
        .insert(t.onboarding)
        .values({ repoId: gen.repoId, json: tour, generatedAt: finishedAt })
        .onConflictDoUpdate({
          target: t.onboarding.repoId,
          set: { json: tour, generatedAt: finishedAt },
        });
      await tx
        .update(t.onboardingGenerations)
        .set({ outcome: 'stored', reason: tour.skeleton_reason, detail })
        .where(
          and(
            eq(t.onboardingGenerations.workspaceId, workspaceId),
            eq(t.onboardingGenerations.id, generationId),
          ),
        );
      return 'stored';
    });
  }

  async getTour(workspaceId: string, repoId: string): Promise<OnboardingTour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    if (!row) return null;
    const parsed = OnboardingTour.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async indexingInProgress(workspaceId: string, repoId: string): Promise<boolean> {
    // `jobs` has no created-at column: "fresh" = scheduled within the window (A5).
    const since = new Date(Date.now() - INDEXING_FRESH_MS);
    const [row] = await this.db
      .select({ id: t.jobs.id })
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          inArray(t.jobs.kind, [...INDEXING_JOB_KINDS]),
          inArray(t.jobs.status, ['queued', 'running']),
          sql`${t.jobs.payload}->>'repoId' = ${repoId}`,
          gt(t.jobs.scheduledAt, since),
        ),
      )
      .limit(1);
    return !!row;
  }
}
