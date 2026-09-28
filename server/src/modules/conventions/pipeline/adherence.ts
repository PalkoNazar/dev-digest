import type { CodeMatch } from '@devdigest/shared';
import {
  FULL_SUPPORT_FILES,
  MAX_PATTERN_LENGTH,
  MIN_ADHERENCE,
  MIN_FILES_TO_JUDGE,
  NO_DETECTOR_CONFIDENCE_CAP,
  PATTERN_ONLY_CONFIDENCE_CAP,
  SINGLE_FILE_CONFIDENCE_CAP,
  SOURCE_EXTENSIONS,
} from '../constants.js';
import type { Adherence, ExtractedDetector } from '../types.js';
import { normalizePath } from './sampling.js';

/**
 * Adherence — how much of the repo actually follows a proposed rule. The model
 * supplies regexes; code counts files. Confidence is derived from these counts,
 * so "91%" in the UI means "91% of matching files conform", not a model's hunch.
 */

/** Nested quantifier like `(a+)+` / `(\w*)*` — catastrophic backtracking in JS. */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/;

/**
 * A model-written regex we are willing to run. It goes to ripgrep (after `-e`/`--`)
 * or, without the binary, to a JS RegExp over every file — so: bounded length, no
 * flag-looking prefix, no backreferences/lookaround (rg rejects them anyway), no
 * nested quantifiers, compiles, and does not match the empty string (`.*`).
 */
export function isSafePattern(pattern: string | null | undefined): pattern is string {
  if (!pattern) return false;
  if (pattern.length > MAX_PATTERN_LENGTH || pattern.trim() !== pattern) return false;
  if (pattern.startsWith('-') || /[\r\n]/.test(pattern)) return false;
  if (/\\[1-9]/.test(pattern) || /\(\?<?[=!]/.test(pattern)) return false;
  if (NESTED_QUANTIFIER.test(pattern)) return false;
  try {
    return !new RegExp(pattern).test('');
  } catch {
    return false;
  }
}

function isSourcePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function filesOf(matches: CodeMatch[], prefix: string | null): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    const path = normalizePath(m.path);
    if (!isSourcePath(path)) continue;
    if (prefix && !path.startsWith(prefix)) continue;
    out.add(path);
  }
  return out;
}

/**
 * Run the detector over the repo. `null` = no usable detector (missing, unsafe, the
 * search failed, or the pattern matches nothing — then it can't describe this repo).
 */
export async function measureAdherence(
  detector: ExtractedDetector | null,
  grep: (pattern: string) => Promise<CodeMatch[]>,
): Promise<Adherence | null> {
  if (!detector || !isSafePattern(detector.pattern)) return null;
  const prefix = detector.path_prefix ? normalizePath(detector.path_prefix) || null : null;
  try {
    const support = filesOf(await grep(detector.pattern), prefix);
    if (support.size === 0) return null;
    if (!isSafePattern(detector.counter_pattern)) {
      return { adherence: null, support: support.size, violations: null };
    }
    const violating = filesOf(await grep(detector.counter_pattern), prefix);
    const conforming = [...support].filter((f) => !violating.has(f)).length;
    const total = conforming + violating.size;
    return {
      adherence: total > 0 ? conforming / total : null,
      support: conforming,
      violations: violating.size,
    };
  } catch {
    return null;
  }
}

/** The repo mostly breaks the rule → it is not a convention here. */
export function isLowAdherence(m: Adherence | null): boolean {
  if (!m || m.adherence === null) return false;
  return m.support + (m.violations ?? 0) >= MIN_FILES_TO_JUDGE && m.adherence < MIN_ADHERENCE;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Confidence from measurements; the model's own number only when nothing was measured. */
export function scoreConfidence(input: {
  modelConfidence: number;
  measured: Adherence | null;
  evidenceFiles: number;
}): number {
  const { modelConfidence, measured, evidenceFiles } = input;
  let c: number;
  if (!measured) {
    c = Math.min(clamp01(modelConfidence), NO_DETECTOR_CONFIDENCE_CAP);
  } else if (measured.adherence === null) {
    c = PATTERN_ONLY_CONFIDENCE_CAP * Math.min(1, measured.support / FULL_SUPPORT_FILES);
  } else {
    const matched = measured.support + (measured.violations ?? 0);
    c = measured.adherence * Math.min(1, matched / FULL_SUPPORT_FILES);
  }
  if (evidenceFiles < 2) c = Math.min(c, SINGLE_FILE_CONFIDENCE_CAP);
  return round2(clamp01(c));
}
