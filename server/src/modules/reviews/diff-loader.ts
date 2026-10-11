import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 *
 * The clone only follows the default branch, so a PR's head commit is not in it
 * until fetched: when the first diff fails or is empty, fetch `pull/<n>/head`
 * (GitHub keeps it for every PR, forks included) and diff again.
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  const ref = { owner: repoRow.owner, name: repoRow.name };
  const gitDiff = async (): Promise<UnifiedDiff | null> => {
    const diff = await container.git.diff(ref, pull.base, pull.headSha);
    return diff.files.length > 0 ? diff : null;
  };
  try {
    const diff = await gitDiff();
    if (diff) return diff;
  } catch {
    /* head not in the clone yet — fetch it below */
  }
  try {
    await container.git.fetchPullHead(ref, pull.number);
    const diff = await gitDiff();
    if (diff) return diff;
  } catch {
    /* no clone / offline — fall through to pr_files reconstruction */
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
