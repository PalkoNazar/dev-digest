import type { Finding } from '@devdigest/shared';
import { SEV_RANK } from '../output/to-review.js';

/**
 * Out-of-scope filter — a pure, deterministic post-step that runs AFTER the
 * citation-grounding gate and BEFORE the score is computed.
 *
 * - `tag`: findings keep their `scope` tag; nothing is dropped (low-confidence
 *   or fallback intent).
 * - `enforce`: findings tagged `scope: 'out'` are dropped, except
 *   - exempt findings, which are never dropped — the intent is shaped by the
 *     author-controlled PR body, so it must not be able to hide them: every
 *     CRITICAL, secret leaks, lethal trifectas and security at WARNING+; and
 *   - the single most severe of the REMAINING (non-exempt) ones with severity
 *     WARNING or higher, kept as the "Outside PR scope" signal. An exempt
 *     finding never takes the signal slot, so it can't push a WARNING out.
 *
 * Untagged (`scope` null/undefined) and `in` findings are never touched.
 */

export type ScopeMode = 'enforce' | 'tag';

export interface ScopeFilterResult {
  /** Findings that stay in the review, in their original order. */
  kept: Finding[];
  /** Out-of-scope findings dropped in enforce mode. */
  filtered: Finding[];
  /** The one out-of-scope finding (WARNING or higher) kept as the signal. */
  signal: Finding | null;
}

/** Minimum severity rank for the kept signal (WARNING). */
const SIGNAL_MIN_RANK = 2;

const EXEMPT_KINDS: ReadonlySet<string> = new Set(['secret_leak', 'lethal_trifecta']);

function isExempt(f: Finding): boolean {
  if (f.severity === 'CRITICAL') return true;
  if (f.kind && EXEMPT_KINDS.has(f.kind)) return true;
  return f.category === 'security' && (SEV_RANK[f.severity] ?? 0) >= SIGNAL_MIN_RANK;
}

/** Severity rank, then confidence; earlier wins ties (strictly greater replaces). */
function outranks(a: Finding, b: Finding): boolean {
  const ra = SEV_RANK[a.severity] ?? 0;
  const rb = SEV_RANK[b.severity] ?? 0;
  if (ra !== rb) return ra > rb;
  return a.confidence > b.confidence;
}

export function applyScopeFilter(findings: Finding[], mode: ScopeMode): ScopeFilterResult {
  // Exempt findings stay anyway; only the droppable ones compete for the signal.
  const candidates = findings.filter((f) => f.scope === 'out' && !isExempt(f));
  if (mode === 'tag' || candidates.length === 0) {
    return { kept: findings, filtered: [], signal: null };
  }

  let signal: Finding | null = null;
  for (const f of candidates) {
    if ((SEV_RANK[f.severity] ?? 0) < SIGNAL_MIN_RANK) continue;
    if (signal === null || outranks(f, signal)) signal = f;
  }

  const kept: Finding[] = [];
  const filtered: Finding[] = [];
  for (const f of findings) {
    if (f.scope !== 'out' || f === signal || isExempt(f)) kept.push(f);
    else filtered.push(f);
  }
  return { kept, filtered, signal };
}
