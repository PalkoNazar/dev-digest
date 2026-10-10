import type { Severity } from '@devdigest/shared';
import {
  BLAST_BUDGET_HINT,
  BLAST_DEGRADED_HINT,
  BLAST_RESULT_BUDGET_CHARS,
  CONCISE_TITLE_MAX,
  CONVENTIONS_TRUNCATED_HINT,
  DEFAULT_LIMIT,
  DEFAULT_MIN_SEVERITY,
  FINDINGS_BUDGET_HINT,
  FINDINGS_TRUNCATED_HINT,
  REVIEW_RESULT_BUDGET_CHARS,
  SEVERITY_RANK,
} from './constants.js';
import type { BlastView, ConventionView, FindingView, ReviewView } from './views.js';

/** Pure shaping of API views into compact tool results (no I/O). */

export type Detail = 'concise' | 'full';

export interface ConciseFinding {
  severity: Severity;
  file: string;
  /** `"start-end"`. */
  line: string;
  title: string;
}

export interface FullFinding extends ConciseFinding {
  rationale: string;
  suggestion: string | null;
  confidence: number;
}

export type FormattedFinding = ConciseFinding | FullFinding;

export interface FindingOptions {
  minSeverity?: Severity;
  detail?: Detail;
  limit?: number;
}

/** A list cut at a limit: `more` = items left out, with a hint how to get them. */
export interface Truncated<T> {
  items: T[];
  more?: number;
  hint?: string;
}

export interface ReviewResult {
  run_id: string | null;
  agent: string;
  verdict: ReviewView['verdict'];
  score: number | null;
  findings: FormattedFinding[];
  more?: number;
  hint?: string;
}

export interface ConventionResult {
  category: ConventionView['category'];
  rule: string;
  /** Primary evidence file, if any. */
  file: string | null;
}

export function truncate<T>(items: readonly T[], limit: number, hint: string): Truncated<T> {
  if (items.length <= limit) return { items: [...items] };
  return { items: items.slice(0, limit), more: items.length - limit, hint };
}

/** Cut `text` to `max` chars, marking the cut with `…`. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function formatFinding(finding: FindingView, detail: Detail = 'concise'): FormattedFinding {
  const concise: ConciseFinding = {
    severity: finding.severity,
    file: finding.file,
    line: `${finding.start_line}-${finding.end_line}`,
    title: clip(finding.title, CONCISE_TITLE_MAX),
  };
  if (detail === 'concise') return concise;
  return {
    ...concise,
    title: finding.title,
    rationale: finding.rationale,
    suggestion: finding.suggestion ?? null,
    confidence: finding.confidence,
  };
}

/** Not dismissed, at least `minSeverity`, most severe first, then by file and line. */
export function filterFindings(
  findings: readonly FindingView[],
  minSeverity: Severity = DEFAULT_MIN_SEVERITY,
): FindingView[] {
  const maxRank = SEVERITY_RANK[minSeverity];
  return findings
    .filter((f) => f.dismissed_at == null && SEVERITY_RANK[f.severity] <= maxRank)
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.file.localeCompare(b.file) ||
        a.start_line - b.start_line,
    );
}

/**
 * One review as a tool result: filter → sort → cut at `limit` → cut at the size budget of its
 * minified JSON (`REVIEW_RESULT_BUDGET_CHARS[detail]`). `more` counts every finding left out.
 */
export function reviewView(review: ReviewView, options: FindingOptions = {}): ReviewResult {
  const detail = options.detail ?? 'concise';
  const base: ReviewResult = {
    run_id: review.run_id,
    agent: review.agent_name ?? review.agent_id ?? 'unknown',
    verdict: review.verdict,
    score: review.score,
    findings: [],
  };
  const kept = filterFindings(review.findings, options.minSeverity);
  const candidates = kept.slice(0, options.limit ?? DEFAULT_LIMIT);

  // Running size of `{...base, findings: [...], more, hint}`: reserve the longest more/hint
  // suffix up front, then add each finding plus its comma separator.
  const reserved = JSON.stringify({ more: kept.length, hint: FINDINGS_BUDGET_HINT }).length;
  let size = JSON.stringify(base).length + reserved;
  const findings: FormattedFinding[] = [];
  for (const finding of candidates) {
    const item = formatFinding(finding, detail);
    const itemSize = JSON.stringify(item).length + (findings.length > 0 ? 1 : 0);
    if (findings.length > 0 && size + itemSize > REVIEW_RESULT_BUDGET_CHARS[detail]) break;
    findings.push(item);
    size += itemSize;
  }

  const more = kept.length - findings.length;
  if (more === 0) return { ...base, findings };
  const hint =
    findings.length < candidates.length ? FINDINGS_BUDGET_HINT : FINDINGS_TRUNCATED_HINT;
  return { ...base, findings, more, hint };
}

export function conventionView(convention: ConventionView): ConventionResult {
  return {
    category: convention.category,
    rule: convention.rule,
    file: convention.evidence[0]?.path ?? null,
  };
}

/** Conventions cut at `limit` and formatted. */
export function selectConventions(
  conventions: readonly ConventionView[],
  limit: number = DEFAULT_LIMIT,
): Truncated<ConventionResult> {
  const cut = truncate(conventions, limit, CONVENTIONS_TRUNCATED_HINT);
  return { ...cut, items: cut.items.map(conventionView) };
}

/** One changed symbol with downstream callers, compacted for a tool result. */
export interface BlastSymbolResult {
  symbol: string;
  /** `"file:line name"`, in the server's rank order. */
  callers: string[];
  endpoints: string[];
  crons: string[];
  /** Set when this symbol's own lists were cut to fit the budget (an oversized first symbol). */
  truncated?: true;
}

export interface BlastResult {
  summary: string;
  stats?: BlastView['stats'];
  /** Commit the index was built at — caller line numbers refer to it, not the PR head. */
  index_sha?: string;
  degraded?: true;
  reason?: BlastView['reason'];
  symbols: BlastSymbolResult[];
  /** Downstream symbols left out by the size budget. */
  more?: number;
  hint?: string;
}

function blastSymbol(impact: BlastView['downstream'][number]): BlastSymbolResult {
  return {
    symbol: impact.symbol,
    callers: impact.callers.map((c) => `${c.file}:${c.line} ${c.name}`),
    endpoints: impact.endpoints_affected,
    crons: impact.crons_affected,
  };
}

/**
 * Cut one symbol's callers, then endpoints, then crons from the end until its JSON fits in
 * `room` chars (never below empty lists). Marks it `truncated`.
 */
function fitSymbol(item: BlastSymbolResult, room: number): BlastSymbolResult {
  const out: BlastSymbolResult = {
    ...item,
    callers: [...item.callers],
    endpoints: [...item.endpoints],
    crons: [...item.crons],
    truncated: true,
  };
  for (const list of [out.callers, out.endpoints, out.crons]) {
    while (list.length > 0 && JSON.stringify(out).length > room) list.pop();
  }
  return out;
}

/**
 * A blast map as a tool result: summary + stats, a degraded reason with a resync hint, then the
 * downstream symbols in server order, cut at `BLAST_RESULT_BUDGET_CHARS` of minified JSON.
 * `more` counts the symbols left out; at least one is always kept.
 */
export function blastView(blast: BlastView): BlastResult {
  const degradedHint = blast.degraded ? BLAST_DEGRADED_HINT : undefined;
  const base: BlastResult = {
    summary: blast.summary,
    ...(blast.stats ? { stats: blast.stats } : {}),
    ...(blast.index_sha ? { index_sha: blast.index_sha } : {}),
    ...(blast.degraded ? { degraded: true as const } : {}),
    ...(blast.degraded && blast.reason ? { reason: blast.reason } : {}),
    ...(degradedHint ? { hint: degradedHint } : {}),
    symbols: [],
  };

  const overflowHint = degradedHint ? `${degradedHint}; ${BLAST_BUDGET_HINT}` : BLAST_BUDGET_HINT;
  // Reserve the longest more/hint suffix up front, then add each symbol plus its comma.
  const reserved = JSON.stringify({ more: blast.downstream.length, hint: overflowHint }).length;
  let size = JSON.stringify(base).length + reserved;
  const symbols: BlastSymbolResult[] = [];
  for (const impact of blast.downstream) {
    let item = blastSymbol(impact);
    let itemSize = JSON.stringify(item).length + (symbols.length > 0 ? 1 : 0);
    if (size + itemSize > BLAST_RESULT_BUDGET_CHARS) {
      if (symbols.length > 0) break;
      // The first symbol alone is over budget: keep it, cut its own lists instead.
      item = fitSymbol(item, BLAST_RESULT_BUDGET_CHARS - size);
      itemSize = JSON.stringify(item).length;
    }
    symbols.push(item);
    size += itemSize;
  }

  const more = blast.downstream.length - symbols.length;
  const cut = symbols.some((sym) => sym.truncated);
  if (more === 0 && !cut) return { ...base, symbols };
  return { ...base, symbols, ...(more > 0 ? { more } : {}), hint: overflowHint };
}
