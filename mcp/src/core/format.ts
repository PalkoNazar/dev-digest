import type { Severity } from '@devdigest/shared';
import {
  CONCISE_TITLE_MAX,
  CONVENTIONS_TRUNCATED_HINT,
  DEFAULT_LIMIT,
  DEFAULT_MIN_SEVERITY,
  FINDINGS_TRUNCATED_HINT,
  SEVERITY_RANK,
} from './constants.js';
import type { ConventionView, FindingView, ReviewView } from './views.js';

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

/** Filter → sort → cut at `limit` → format. */
export function selectFindings(
  findings: readonly FindingView[],
  options: FindingOptions = {},
): Truncated<FormattedFinding> {
  const kept = filterFindings(findings, options.minSeverity);
  const cut = truncate(kept, options.limit ?? DEFAULT_LIMIT, FINDINGS_TRUNCATED_HINT);
  const items = cut.items.map((f) => formatFinding(f, options.detail));
  return cut.more === undefined ? { items } : { ...cut, items };
}

export function reviewView(review: ReviewView, options: FindingOptions = {}): ReviewResult {
  const { items, more, hint } = selectFindings(review.findings, options);
  return {
    run_id: review.run_id,
    agent: review.agent_name ?? review.agent_id ?? 'unknown',
    verdict: review.verdict,
    score: review.score,
    findings: items,
    ...(more !== undefined ? { more, hint } : {}),
  };
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
