/* lib/repo-resync.ts — completion check for a repo-intel resync (POST /repos/:id/resync).
   The resync runs as a server job; the UI polls the index state and treats a new
   `updatedAt` as "done". Used by BlastRadiusCard and ProjectContextView. */
import type { RepoIntelState } from "./hooks/repo-intel";

/** How long a resync is awaited before giving up (the job may never write a new index state). */
export const RESYNC_TIMEOUT_MS = 120_000;

/**
 * A resync whose baseline index state had `updatedAt === startedAt` is finished once
 * the state reports a different `updatedAt` (a new index row).
 */
export function resyncFinished(
  startedAt: string,
  state: Pick<RepoIntelState, "updatedAt"> | undefined,
): boolean {
  return !!state && state.updatedAt !== startedAt;
}
