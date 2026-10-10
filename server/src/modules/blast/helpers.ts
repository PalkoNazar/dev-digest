import type {
  BlastDegradedReason,
  BlastRadius,
  BlastStats,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastSourceResult } from './ports.js';

/** Short prefix of the summary line per degraded reason. */
const DEGRADED_PREFIX: Record<BlastDegradedReason, string> = {
  flag_off: 'Repo intel off',
  index_failed: 'Index failed',
  index_partial: 'Index partial',
  repo_too_large: 'Repo too large',
  no_data: 'No index',
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Deterministic English summary, e.g. "3 changed symbols · 7 callers · 2 endpoints · 1 cron". */
export function blastSummary(
  stats: BlastStats,
  degraded: boolean,
  reason?: BlastDegradedReason,
): string {
  const line = [
    plural(stats.symbols, 'changed symbol', 'changed symbols'),
    plural(stats.callers, 'caller', 'callers'),
    plural(stats.endpoints, 'endpoint', 'endpoints'),
    plural(stats.crons, 'cron', 'crons'),
  ].join(' · ');
  if (!degraded) return line;
  return `${reason ? DEGRADED_PREFIX[reason] : 'Index incomplete'} — ${line}`;
}

interface Group {
  impact: DownstreamImpact;
  maxRank: number;
  files: Set<string>;
}

/**
 * Facade result (flat callers) → `BlastRadius` contract (callers grouped per
 * changed symbol, rank order kept). Endpoints/crons of a group = the sorted,
 * deduped union of its caller files' facts. A caller in a file that declares a
 * same-named changed symbol is dropped (a declaration is not its own caller).
 */
export function toBlastRadius(r: BlastSourceResult): BlastRadius {
  const changed_symbols = r.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind }));

  const declFiles = new Map<string, Set<string>>();
  for (const s of r.changedSymbols) {
    const set = declFiles.get(s.name);
    if (set) set.add(s.file);
    else declFiles.set(s.name, new Set([s.file]));
  }

  const groups = new Map<string, Group>();
  for (const c of r.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    let g = groups.get(c.viaSymbol);
    if (!g) {
      g = {
        impact: { symbol: c.viaSymbol, callers: [], endpoints_affected: [], crons_affected: [] },
        maxRank: c.rank,
        files: new Set(),
      };
      groups.set(c.viaSymbol, g);
    }
    g.impact.callers.push({ name: c.symbol, file: c.file, line: c.line });
    g.maxRank = Math.max(g.maxRank, c.rank);
    g.files.add(c.file);
  }

  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  for (const g of groups.values()) {
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of g.files) {
      const facts = r.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    g.impact.endpoints_affected = [...endpoints].sort();
    g.impact.crons_affected = [...crons].sort();
    for (const e of endpoints) allEndpoints.add(e);
    for (const c of crons) allCrons.add(c);
  }

  const downstream = [...groups.values()]
    .sort(
      (a, b) =>
        b.maxRank - a.maxRank ||
        b.impact.callers.length - a.impact.callers.length ||
        a.impact.symbol.localeCompare(b.impact.symbol),
    )
    .map((g) => g.impact);

  const stats: BlastStats = {
    symbols: changed_symbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  };
  const degraded = r.degraded ?? false;

  return {
    changed_symbols,
    downstream,
    summary: blastSummary(stats, degraded, r.reason),
    degraded,
    ...(r.reason ? { reason: r.reason } : {}),
    stats,
    index_sha: r.indexedSha ?? null,
  };
}
