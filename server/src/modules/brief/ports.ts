import type { FeatureModelChoice, PrBrief } from '@devdigest/shared';
import type { BriefSnapshot, StoredBrief } from './types.js';

/**
 * Ports of the PR Brief module (SPEC-03). Every method is scoped by `workspaceId`.
 */
export interface BriefRepo {
  /** The PR's current head + its stored brief (null when none or unreadable); null = PR not in ws. */
  readBrief(workspaceId: string, prId: string): Promise<{ headSha: string; brief: PrBrief | null } | null>;
  /** PR row (+ repo) and its `pr_files`, read in one repeatable-read transaction; null = PR not in ws. */
  snapshot(workspaceId: string, prId: string): Promise<BriefSnapshot | null>;
  /**
   * Validate (`PrBrief`), upsert and return the stored brief + the PR's current head,
   * in one transaction. Invalid → throws `invalid_brief` before any write; null = PR not in ws.
   */
  saveBrief(workspaceId: string, prId: string, brief: PrBrief): Promise<StoredBrief | null>;
  /** Settings → Feature Models → Risk Brief, else the registry default (AC-43). */
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
}
