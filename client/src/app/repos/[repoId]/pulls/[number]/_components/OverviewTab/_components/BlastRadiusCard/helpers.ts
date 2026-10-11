import type { BlastRadius, ChangedSymbol } from "@devdigest/shared";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";

/** Symbol kinds rendered with a call suffix, e.g. `buildPrompt()`. */
const CALLABLE_KINDS = new Set(["function", "method"]);

/** Commit caller lines refer to: the index's SHA, else the PR head (best effort). */
export function linkSha(blast: Pick<BlastRadius, "index_sha">, headSha: string | null): string | null {
  return blast.index_sha || headSha || null;
}

/**
 * `name()` when the changed symbol (that name, and that file when known) is a
 * function/method, else the bare name.
 */
export function symbolLabel(symbol: string, changed: ChangedSymbol[], file?: string): string {
  const callable = changed.some(
    (c) => c.name === symbol && (!file || c.file === file) && CALLABLE_KINDS.has(c.kind),
  );
  return callable ? `${symbol}()` : symbol;
}

/** Changed-symbol names that head more than one downstream group (declared in several files). */
export function duplicateSymbols(downstream: BlastRadius["downstream"]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const d of downstream) {
    if (seen.has(d.symbol)) dup.add(d.symbol);
    seen.add(d.symbol);
  }
  return dup;
}

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
