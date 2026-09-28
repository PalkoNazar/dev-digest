import type { ConventionEvidence } from '@devdigest/shared';
import {
  MAX_EVIDENCE_PER_CANDIDATE,
  MAX_EVIDENCE_SPAN,
  MIN_SNIPPET_LINE_CHARS,
} from '../constants.js';
import { normalizePath } from './sampling.js';

/**
 * Evidence gate — the conventions counterpart of `groundFindings`. A citation is
 * kept only if its file was in the sample AND its snippet really sits at (or, if the
 * model miscounted, near) the cited lines. The stored snippet is the file's text,
 * never the model's quote, so the UI can't show invented code.
 */

interface ProposedEvidence {
  path: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

const norm = (line: string) => line.trim().replace(/\s+/g, ' ');

/** Normalized, non-empty snippet lines; `null` when nothing in it is specific enough. */
function snippetLines(snippet: string): string[] | null {
  const lines = snippet
    .split('\n')
    // the model may echo our "  12| " line-number gutter
    .map((l) => norm(l.replace(/^\s*\d+\|\s?/, '')))
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/…$/, ''));
  return lines.some((l) => l.length >= MIN_SNIPPET_LINE_CHARS) ? lines : null;
}

/**
 * Index (in `window`) of the last line matched when every snippet line is found, in
 * order, inside a window line; -1 otherwise.
 */
function matchInOrder(window: string[], wanted: string[]): number {
  let at = 0;
  let last = -1;
  for (const w of wanted) {
    while (at < window.length && !norm(window[at]!).includes(w)) at++;
    if (at >= window.length) return -1;
    last = at;
    at++;
  }
  return last;
}

function span(start: number, end: number): boolean {
  return end >= start && end - start < MAX_EVIDENCE_SPAN;
}

/** Where the snippet really is: the cited range if it holds, else its first occurrence. */
function locate(
  lines: string[],
  wanted: string[],
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (start >= 1 && end <= lines.length && span(start, end)) {
    if (matchInOrder(lines.slice(start - 1, end), wanted) >= 0) return { start, end };
  }
  const first = wanted[0]!;
  for (let i = 0; i < lines.length; i++) {
    if (!norm(lines[i]!).includes(first)) continue;
    const window = lines.slice(i, i + wanted.length + MAX_EVIDENCE_SPAN / 4);
    const last = matchInOrder(window, wanted);
    if (last >= 0) return { start: i + 1, end: i + 1 + last };
  }
  return null;
}

/** Verified citations (deduplicated, primary first); [] means "no evidence". */
export function verifyEvidence(
  proposed: ProposedEvidence[],
  files: ReadonlyMap<string, string>,
): ConventionEvidence[] {
  const out: ConventionEvidence[] = [];
  for (const e of proposed.slice(0, MAX_EVIDENCE_PER_CANDIDATE)) {
    const path = normalizePath(e.path);
    const content = files.get(path);
    if (content === undefined) continue;
    const wanted = snippetLines(e.snippet);
    if (!wanted) continue;
    const lines = content.split('\n');
    const at = locate(lines, wanted, Math.min(e.line_start, e.line_end), Math.max(e.line_start, e.line_end));
    if (!at) continue;
    if (out.some((o) => o.path === path && o.line_start === at.start)) continue;
    out.push({
      path,
      line_start: at.start,
      line_end: at.end,
      snippet: lines.slice(at.start - 1, at.end).join('\n'),
    });
  }
  return out;
}
