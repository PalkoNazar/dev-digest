/* smart-diff.ts — pure selection of the findings the Files changed tab shows:
   the latest review of every agent (mirror of the server's
   `latestReviewsPerAgent` in `server/src/modules/reviews/smart-diff/build.ts`). */
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * The newest `kind === "review"` review per agent (a null agent is its own
 * bucket). Input order does not matter; output is newest first.
 */
export function latestReviewsPerAgent(reviews: readonly ReviewRecord[]): ReviewRecord[] {
  const latest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const prev = latest.get(r.agent_id);
    if (!prev || Date.parse(r.created_at) > Date.parse(prev.created_at)) latest.set(r.agent_id, r);
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Findings of the given reviews by file path (dismissed ones included). */
export function findingsByFile(reviews: readonly ReviewRecord[]): Map<string, FindingRecord[]> {
  const byFile = new Map<string, FindingRecord[]>();
  for (const r of reviews) {
    for (const f of r.findings) {
      const list = byFile.get(f.file) ?? [];
      list.push(f);
      byFile.set(f.file, list);
    }
  }
  return byFile;
}

/** A dismissed finding is still shown (muted) but never counted. */
export function countsAsFinding(f: FindingRecord): boolean {
  return !f.dismissed_at;
}

/** How many of `paths` have at least one counted finding. */
export function filesWithFindings(
  paths: readonly string[],
  byFile: ReadonlyMap<string, readonly FindingRecord[]>,
): number {
  return paths.filter((p) => (byFile.get(p) ?? []).some(countsAsFinding)).length;
}
