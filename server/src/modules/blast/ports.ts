import type { BlastDegradedReason } from '@devdigest/shared';

/**
 * What the blast use cases need, in domain terms. `BlastSource` is a structural
 * copy of the repo-intel facade's `getBlastRadius` (this module must not import
 * `repo-intel/*`); `container.repoIntel` satisfies it at the composition root.
 */

export interface BlastSourceResult {
  changedSymbols: Array<{ file: string; name: string; kind: string }>;
  callers: Array<{
    file: string;
    /** Enclosing symbol of the reference in the caller file. */
    symbol: string;
    /** Which changed symbol this caller reaches. */
    viaSymbol: string;
    /** File declaring `viaSymbol`, when the index resolved it. */
    viaFile?: string;
    /** 1-based line at `indexedSha`. */
    line: number;
    rank: number;
  }>;
  impactedEndpoints: string[];
  /** Endpoints/crons reachable from each caller file (persistent index only). */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
  indexedSha?: string;
}

export interface BlastSource {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastSourceResult>;
}

/** A workspace-scoped pull request, reduced to what blast needs. */
export interface BlastPull {
  id: string;
  repoId: string;
}

/** Pure reads — no upsert, no GitHub. Every method is scoped by `workspaceId`. */
export interface BlastRepo {
  findPull(workspaceId: string, prId: string): Promise<BlastPull | null>;
  findPullByNumber(workspaceId: string, repoId: string, number: number): Promise<BlastPull | null>;
  /** Distinct `pr_files.path` of the pull. */
  listChangedFiles(workspaceId: string, prId: string): Promise<string[]>;
}

/** The slice of a pino logger the service uses (counts/status only, never contents). */
export interface BlastLogger {
  info(obj: object, msg: string): void;
}

export interface BlastDeps {
  repo: BlastRepo;
  source: BlastSource;
}
