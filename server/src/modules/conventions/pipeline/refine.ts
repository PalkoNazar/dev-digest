import type { CodeMatch } from '@devdigest/shared';
import { GREP_CONCURRENCY, MAX_CANDIDATES } from '../constants.js';
import type { DropReason, ExtractedConvention, NewConvention, ToolingFact } from '../types.js';
import { isLowAdherence, measureAdherence, scoreConfidence } from './adherence.js';
import { verifyEvidence } from './evidence.js';
import type { KnownRule } from './prompt.js';
import { matchTooling } from './tooling.js';

/**
 * Model proposals → stored candidates. Order of gates: cheap and certain first
 * (text, evidence, duplicates), the repo-wide grep last.
 */

/** Rule text for equality checks: case, punctuation and spacing don't matter. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`'".,;:!?()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RefineResult {
  kept: NewConvention[];
  dropped: Partial<Record<DropReason, number>>;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function refineCandidates(input: {
  proposed: ExtractedConvention[];
  files: ReadonlyMap<string, string>;
  facts: ToolingFact[];
  known: KnownRule[];
  grep: (pattern: string) => Promise<CodeMatch[]>;
}): Promise<RefineResult> {
  const dropped: Partial<Record<DropReason, number>> = {};
  const drop = (reason: DropReason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  const decided = new Set(input.known.map((k) => normalizeRule(k.rule)));
  const seen = new Set<string>();

  const verified: { c: ExtractedConvention; rule: string; evidence: NewConvention['evidence'] }[] = [];
  for (const c of input.proposed.slice(0, MAX_CANDIDATES)) {
    const rule = c.rule.trim().replace(/\s+/g, ' ');
    const key = normalizeRule(rule);
    if (!key) {
      drop('empty_rule');
      continue;
    }
    const evidence = verifyEvidence(c.evidence, input.files);
    if (evidence.length === 0) {
      drop('unverified_evidence');
      continue;
    }
    if (decided.has(key)) {
      drop('already_decided');
      continue;
    }
    if (seen.has(key)) {
      drop('duplicate');
      continue;
    }
    seen.add(key);
    verified.push({ c, rule, evidence });
  }

  const measured = await mapLimit(verified, GREP_CONCURRENCY, (v) =>
    measureAdherence(v.c.detector, input.grep),
  );

  const kept: NewConvention[] = [];
  verified.forEach((v, i) => {
    const m = measured[i] ?? null;
    if (isLowAdherence(m)) {
      drop('low_adherence');
      return;
    }
    kept.push({
      category: v.c.category,
      rule: v.rule,
      evidence: v.evidence,
      confidence: scoreConfidence({
        modelConfidence: v.c.confidence,
        measured: m,
        evidenceFiles: new Set(v.evidence.map((e) => e.path)).size,
      }),
      adherence: m?.adherence ?? null,
      supportFiles: m ? m.support : null,
      violationFiles: m?.violations ?? null,
      enforcedBy: matchTooling(v.rule, input.facts),
    });
  });
  kept.sort((a, b) => b.confidence - a.confidence);
  return { kept, dropped };
}
