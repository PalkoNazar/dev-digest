import type { Finding, SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

/** The review fields the latest-per-agent selection reads (no DB row type here). */
export interface ReviewStamp {
  id: string;
  kind: string;
  agentId: string | null;
  createdAt: Date;
}

/**
 * The newest `kind === 'review'` review of every agent (a null agent — e.g. the
 * seed review — is its own bucket). Input order does not matter; output is
 * newest first. Generic so the caller keeps its own record type.
 */
export function latestReviewsPerAgent<R extends ReviewStamp>(reviews: readonly R[]): R[] {
  const latest = new Map<string | null, R>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const prev = latest.get(r.agentId);
    if (!prev || r.createdAt.getTime() > prev.createdAt.getTime()) latest.set(r.agentId, r);
  }
  return [...latest.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Group a PR's files by role (in `ROLE_ORDER`, empty groups omitted, input
 * order kept inside a group) and attach each file's sorted unique finding
 * start lines. Deterministic: no LLM, no I/O.
 */
export function buildSmartDiff(
  files: readonly SmartDiffInputFile[],
  findings: readonly Pick<Finding, 'file' | 'start_line'>[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.start_line);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const list = byRole.get(role) ?? [];
    list.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    });
    byRole.set(role, list);
  }

  return {
    groups: ROLE_ORDER.flatMap((role) => {
      const groupFiles = byRole.get(role);
      return groupFiles ? [{ role, files: groupFiles }] : [];
    }),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
