/**
 * repo-intel pure helpers (no I/O) — used by the blast-radius facade read.
 */
import type { DegradedReason } from './types.js';

/** Import edge importer → imported (structural; mirrors `file_edges`). */
export interface ImportEdge {
  fromFile: string;
  toFile: string;
}

/** Precomputed facts of one file (structural; mirrors `file_facts`). */
export interface FileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

export interface FileImpact {
  endpoints: string[];
  crons: string[];
}

/** Path kinds that mark a test file (substring match on the lower-cased `/`-prefixed path). */
export const TEST_PATH_PATTERNS = ['.test.', '.spec.', '__tests__/', '/test/', '/tests/'] as const;

export function isTestPath(path: string): boolean {
  const lower = `/${path.toLowerCase()}`;
  return TEST_PATH_PATTERNS.some((t) => lower.includes(t));
}

const DEGRADED_REASONS: ReadonlySet<string> = new Set<DegradedReason>([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);

/** A persisted degraded reason when it is a known one, else `index_failed`. */
export function toDegradedReason(value: unknown): DegradedReason {
  return typeof value === 'string' && DEGRADED_REASONS.has(value)
    ? (value as DegradedReason)
    : 'index_failed';
}

/**
 * Keep at most `max` callers per changed symbol (`viaSymbol`), preserving the
 * input order (callers arrive sorted by rank DESC, so the top-ranked survive).
 */
export function capCallersPerSymbol<T extends { viaSymbol: string }>(
  callers: readonly T[],
  max: number,
): T[] {
  const kept = new Map<string, number>();
  const out: T[] = [];
  for (const c of callers) {
    const n = kept.get(c.viaSymbol) ?? 0;
    if (n >= max) continue;
    kept.set(c.viaSymbol, n + 1);
    out.push(c);
  }
  return out;
}

/**
 * Endpoints/crons reachable from each caller file: the file's own facts plus
 * those of its transitive importers within `importerEdgesByHop.length` extra
 * hops (hop k = the edges fetched for the k-th BFS frontier). Deduped, sorted;
 * edge cycles are safe (each file is visited once per caller).
 */
export function attributeFacts(
  callerFiles: readonly string[],
  importerEdgesByHop: readonly (readonly ImportEdge[])[],
  factRows: readonly FileFactsRow[],
): Record<string, FileImpact> {
  const importersOf = new Map<string, string[]>();
  for (const hop of importerEdgesByHop) {
    for (const e of hop) {
      const arr = importersOf.get(e.toFile);
      if (arr) arr.push(e.fromFile);
      else importersOf.set(e.toFile, [e.fromFile]);
    }
  }
  const factsOf = new Map(factRows.map((f) => [f.filePath, f]));
  const maxHops = importerEdgesByHop.length;

  const out: Record<string, FileImpact> = {};
  for (const file of callerFiles) {
    if (out[file]) continue;
    const visited = new Set([file]);
    let frontier = [file];
    for (let hop = 0; hop < maxHops && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const importer of importersOf.get(f) ?? []) {
          if (visited.has(importer)) continue;
          visited.add(importer);
          next.push(importer);
        }
      }
      frontier = next;
    }
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const f of visited) {
      // Tests call routes (`app.inject`) but serve none — their URLs are not impacted endpoints.
      if (isTestPath(f)) continue;
      const facts = factsOf.get(f);
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    out[file] = { endpoints: [...endpoints].sort(), crons: [...crons].sort() };
  }
  return out;
}
