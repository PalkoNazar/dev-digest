import type { BlastRadius, ChangedSymbol } from "@devdigest/shared";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";

/** Symbol kinds rendered with a call suffix, e.g. `buildPrompt()`. */
const CALLABLE_KINDS = new Set(["function", "method"]);

/** Commit caller lines refer to: the index's SHA, else the PR head (best effort). */
export function linkSha(blast: Pick<BlastRadius, "index_sha">, headSha: string | null): string | null {
  return blast.index_sha || headSha || null;
}

/** `name()` when a changed symbol of that name is a function/method, else the bare name. */
export function symbolLabel(symbol: string, changed: ChangedSymbol[]): string {
  const callable = changed.some((c) => c.name === symbol && CALLABLE_KINDS.has(c.kind));
  return callable ? `${symbol}()` : symbol;
}

/**
 * A resync whose baseline index state had `updatedAt === startedAt` is finished once
 * the state reports a different `updatedAt` (a new index row). Without a baseline
 * (`startedAt` null — clicked before the first state arrived) it is never finished:
 * the caller first captures the baseline from the next state it sees.
 */
export function resyncFinished(
  startedAt: string | null,
  state: Pick<RepoIntelState, "updatedAt"> | undefined,
): boolean {
  return startedAt !== null && !!state && state.updatedAt !== startedAt;
}
