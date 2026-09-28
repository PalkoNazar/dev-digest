import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type ConventionCandidate,
  type ConventionCategory,
  type ConventionScan,
  type ConventionUpdate,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { KNOWN_RULES_IN_PROMPT } from './constants.js';
import type { KnownRule } from './pipeline/prompt.js';
import type { ConventionsRepo, ConventionTarget } from './ports.js';
import type { NewConvention, ScanResult } from './types.js';

/** Conventions data-access: `convention_scans` + `conventions`, workspace-scoped. */

const FEATURE_ID = 'conventions';

type ScanRow = typeof t.conventionScans.$inferSelect;
type ConventionRow = typeof t.conventions.$inferSelect;

function toScanDto(row: ScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    error: row.error,
    sample_paths: row.samplePaths,
    tooling: row.tooling,
    model: row.model,
    cost_usd: row.costUsd,
    proposed: row.proposed,
    kept: row.kept,
    dropped: row.dropped,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId,
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidence: row.evidence,
    confidence: row.confidence ?? 0,
    adherence: row.adherence,
    support_files: row.supportFiles,
    violation_files: row.violationFiles,
    enforced_by: row.enforcedBy,
    status: row.status,
    edited: row.edited,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
  };
}

export class ConventionsRepository implements ConventionsRepo {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ConventionTarget | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /**
   * Settings → Feature Models override for `conventions`, else the registry default.
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

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScan | null> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row ? toScanDto(row) : null;
  }

  async createScan(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, status: 'running' })
      .returning();
    return toScanDto(row!);
  }

  async completeScan(
    workspaceId: string,
    scanId: string,
    result: ScanResult,
    candidates: NewConvention[],
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [scan] = await tx
        .update(t.conventionScans)
        .set({
          status: 'done',
          finishedAt: new Date(),
          samplePaths: result.samplePaths,
          tooling: result.tooling,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          proposed: result.proposed,
          kept: result.kept,
          dropped: result.dropped as Record<string, number>,
        })
        .where(
          and(
            eq(t.conventionScans.workspaceId, workspaceId),
            eq(t.conventionScans.id, scanId),
            eq(t.conventionScans.status, 'running'),
          ),
        )
        .returning({ repoId: t.conventionScans.repoId });
      if (!scan) return false;

      // A re-scan replaces undecided candidates; accepted/rejected ones stay.
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, scan.repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (candidates.length > 0) {
        await tx.insert(t.conventions).values(
          candidates.map((c) => ({
            workspaceId,
            repoId: scan.repoId,
            scanId,
            category: c.category,
            rule: c.rule,
            evidence: c.evidence,
            confidence: c.confidence,
            adherence: c.adherence,
            supportFiles: c.supportFiles,
            violationFiles: c.violationFiles,
            enforcedBy: c.enforcedBy,
          })),
        );
      }
      return true;
    });
  }

  async failScan(workspaceId: string, scanId: string, error: string): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error: error.slice(0, 2000), finishedAt: new Date() })
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.id, scanId),
          eq(t.conventionScans.status, 'running'),
        ),
      );
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence), desc(t.conventions.createdAt));
    return rows.map(toCandidateDto);
  }

  async knownRules(workspaceId: string, repoId: string): Promise<KnownRule[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule, status: t.conventions.status })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      )
      .orderBy(desc(t.conventions.updatedAt))
      .limit(KNOWN_RULES_IN_PROMPT * 5);
    return rows.map((r) => ({ rule: r.rule, status: r.status as KnownRule['status'] }));
  }

  async get(workspaceId: string, id: string): Promise<ConventionCandidate | null> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row ? toCandidateDto(row) : null;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdate & { edited?: boolean },
  ): Promise<ConventionCandidate | null> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.skill_id !== undefined ? { skillId: patch.skill_id } : {}),
        ...(patch.edited ? { edited: true } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toCandidateDto(row) : null;
  }
}
