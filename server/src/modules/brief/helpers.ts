import type { ReviewFocusItem, Risk } from '@devdigest/shared';
import {
  ELLIPSIS,
  MAX_FOCUS,
  MAX_RISKS,
  REASON_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  TITLE_MAX_CHARS,
} from './constants.js';
import type { BriefDraft, GroundedBrief, GroundingSet, LineRange } from './types.js';

/**
 * Pure helpers of the PR Brief (plan S6): token estimate, surrogate-safe cuts,
 * changed line ranges, ref path normalisation, grounding and output caps.
 */

/** Model-input estimate of AC-44: ceil(characters / 4). */
export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Largest cut index ≤ `max` that doesn't split a UTF-16 surrogate pair (AC-101).
 * Local copy of `project-context/helpers.ts` `codePointCut` — modules don't import
 * each other, and a lone surrogate is rejected by Postgres jsonb and LLM APIs.
 */
export function codePointCut(text: string, max: number): number {
  if (text.length <= max) return text.length;
  if (max <= 0) return 0;
  const code = text.charCodeAt(max - 1);
  return code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
}

/** `text` unchanged when it fits `max`, else its first ≤ `max` chars + `suffix`. */
export function cutText(text: string, max: number, suffix: string = ELLIPSIS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, codePointCut(text, max))}${suffix}`;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * New-side changed line ranges of a unified patch, read from the hunk headers only
 * (`+c[,d]`, d defaults to 1, `d = 0` = pure deletion, skipped), merged when they
 * overlap or touch, ascending (AC-89). A null patch (binary / too large) → [].
 */
export function changedRanges(patch: string | null): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) continue;
    ranges.push({ start, end: start + count - 1 });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: LineRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** `12-18, 40` (a one-line range is shown as its line). */
export function formatRanges(ranges: readonly LineRange[]): string {
  return ranges.map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`)).join(', ');
}

/** Strip a leading `./` (any number). */
function stripDotSlash(path: string): string {
  return path.replace(/^(?:\.\/)+/, '');
}

/** The path a ref names: no leading `./`, no trailing `:N` / `:N-M` (AC-55). Else exact. */
export function normalizeRefPath(ref: string): string {
  return stripDotSlash(ref).replace(/:\d+(?:-\d+)?$/, '');
}

function inRanges(line: number, ranges: readonly LineRange[]): boolean {
  return ranges.some((r) => line >= r.start && line <= r.end);
}

/**
 * Check the model's risks and focus items against what the brief may cite
 * (PR files ∪ blast files; PR files only when `blastFiles` is null, AC-53):
 * - a risk ref whose path is not citable is removed (AC-50); a risk left with no
 *   ref is dropped (AC-51); kept refs keep their `:line` suffix (shown as is, AC-9);
 * - a focus item on a non-citable file is dropped (AC-52); a non-positive line → null;
 *   a PR-file line outside every changed range is marked (AC-54); a blast-only
 *   file keeps its line only when it is a caller line (AC-97);
 * - the model order is kept; `removed` counts what grounding removed (AC-56).
 */
export function groundBrief(draft: BriefDraft, set: GroundingSet): GroundedBrief {
  const citable = (path: string) => set.prFiles.has(path) || (set.blastFiles?.has(path) ?? false);
  const removed = { risks: 0, file_refs: 0, review_focus: 0 };

  const risks: Risk[] = [];
  for (const r of draft.risks) {
    const refs = r.file_refs.map(stripDotSlash).filter((ref) => citable(normalizeRefPath(ref)));
    if (refs.length === 0) {
      removed.risks += 1;
      continue;
    }
    removed.file_refs += r.file_refs.length - refs.length;
    risks.push({ ...r, file_refs: refs });
  }

  const review_focus: ReviewFocusItem[] = [];
  for (const f of draft.review_focus) {
    const file = normalizeRefPath(f.file);
    const line = f.line !== null && f.line > 0 ? f.line : null;
    const prRanges = set.prFiles.get(file);
    if (prRanges) {
      const outside = line !== null && !inRanges(line, prRanges);
      review_focus.push({ file, line, reason: f.reason, outside_changed_lines: outside });
      continue;
    }
    const callerLines = set.blastFiles?.get(file);
    if (callerLines) {
      const kept = line !== null && callerLines.includes(line) ? line : null;
      review_focus.push({ file, line: kept, reason: f.reason, outside_changed_lines: false });
      continue;
    }
    removed.review_focus += 1;
  }

  return { summary: draft.summary, risks, review_focus, removed };
}

/**
 * Output caps after grounding (AC-95/96): the first 6 risks and 8 focus items, and
 * every text cut at its cap + "…" (surrogate-safe). Caps are not grounding
 * removals, so `removed` is unchanged.
 */
export function capBrief(grounded: GroundedBrief): GroundedBrief {
  return {
    summary: cutText(grounded.summary, SUMMARY_MAX_CHARS),
    risks: grounded.risks.slice(0, MAX_RISKS).map((r) => ({
      ...r,
      title: cutText(r.title, TITLE_MAX_CHARS),
      explanation: cutText(r.explanation, REASON_MAX_CHARS),
    })),
    review_focus: grounded.review_focus
      .slice(0, MAX_FOCUS)
      .map((f) => ({ ...f, reason: cutText(f.reason, REASON_MAX_CHARS) })),
    removed: { ...grounded.removed },
  };
}
