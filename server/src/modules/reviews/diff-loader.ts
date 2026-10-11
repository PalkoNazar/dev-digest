import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff origin/<base>...head`;
 * falls back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 *
 * The clone follows only the default branch and its local branches are moved only
 * by a resync, so first fetch `pull/<n>/head` and the base into `origin/<base>`.
 * Diffing against a stale local `<base>` would pull every commit merged since the
 * last resync into the review. Offline (fetch fails) the refs already in the clone
 * are tried: `origin/<base>`, then `<base>`.
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  const ref = { owner: repoRow.owner, name: repoRow.name };
  try {
    await container.git.fetchPullHead(ref, pull.number, pull.base);
  } catch {
    /* no clone / offline — try the refs the clone already has */
  }
  for (const base of [`origin/${pull.base}`, pull.base]) {
    try {
      const diff = await container.git.diff(ref, base, pull.headSha);
      if (diff.files.length > 0) return diff;
      // Diffed fine but empty: the head is already in the base (merged, or stacked
      // into another PR). The stale local `<base>` would re-add everything merged
      // since the last resync — stop here.
      break;
    } catch {
      /* ref or head missing — next candidate */
    }
  }
  return diffFromPrFiles(repo, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
