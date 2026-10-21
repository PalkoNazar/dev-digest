import type { BriefInputNote, ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import {
  BODY_MAX_CHARS,
  MAX_CALLER_FILES,
  MAX_INPUT_TOKENS,
  MIN_CUT_CHARS,
  TRUNCATION_MARKER,
} from './constants.js';
import { codePointCut, estTokens, formatRanges } from './helpers.js';
import type { BriefFacts, BriefFileFact } from './types.js';

/**
 * The messages of the one brief call (plan S7). Every fact goes inside a
 * `wrapUntrusted` block with a fixed label; the system message ends with the shared
 * `INJECTION_GUARD` (AC-70). Files are described by path, role, +/- and changed
 * line ranges only — never a hunk header or body line (AC-41, AC-89).
 *
 * Budget (AC-44/45): ceil(chars / 4) of system + user ≤ `MAX_INPUT_TOKENS`. Over it,
 * inputs are shortened in this order, each step only as far as needed: spec docs
 * (whole docs from the end, then the last kept one cut), linked issues (same rule),
 * the description, the caller list, the changed-file list (core first, then by
 * changed lines, plus an "N more files" line). Every shortened input ends with
 * `TRUNCATION_MARKER` (AC-92) and gets a note (AC-46). The instructions, intent and
 * blast summary + stats are never cut (AC-91); still over → `tooLarge` (AC-93).
 */

export type BriefMessages =
  | { messages: ChatMessage[]; estInputTokens: number; notes: BriefInputNote[] }
  | { tooLarge: true; estInputTokens: number };

const NONE = '(none)';
const NOT_AVAILABLE = '(not available)';

/** A list of texts kept whole up to `whole`, then optionally one cut to `cutChars`. */
interface ListKeep {
  whole: number;
  /** Chars kept of item `whole` (cut + marker); null = that item is left out. */
  cutChars: number | null;
}

interface Keep {
  docs: ListKeep;
  issues: ListKeep;
  /** Chars of the (already capped) description; null = whole. 0 = left out. */
  bodyChars: number | null;
  callers: number;
  files: number;
}

interface Prepared {
  body: string;
  /** True when the fixed 4,000-char cap cut the description (AC-90). */
  bodyCapped: boolean;
  callers: string[];
  /** True when the fixed 30-caller cap cut the list (AC-100). */
  callersCapped: boolean;
  /** Files in budget order: core first, then by changed lines (desc). */
  files: BriefFileFact[];
  /** Rendered issue / doc texts with the ref their note names. */
  issues: RefText[];
  docs: RefText[];
}

interface RefText {
  ref: string;
  text: string;
}

function cutWithMarker(text: string, chars: number): string {
  return `${text.slice(0, codePointCut(text, chars))}\n${TRUNCATION_MARKER}`;
}

function fileLine(f: BriefFileFact): string {
  const lines = f.ranges.length ? `lines ${formatRanges(f.ranges)}` : 'no line ranges';
  return `${f.path} · ${f.role} · +${f.additions} −${f.deletions} · ${lines}`;
}

/** `path (lines a, b)` — sorted, deduped caller lines; the bare path when it has none. */
function callerLine(path: string, lines: ReadonlyMap<string, number[]> | undefined): string {
  const nums = [...new Set(lines?.get(path) ?? [])].sort((a, b) => a - b);
  return nums.length ? `${path} (lines ${nums.join(', ')})` : path;
}

function section(title: string, label: string, body: string): string {
  return `## ${title}\n${wrapUntrusted(label, body)}`;
}

/**
 * The texts of the whole items, then the cut one (ending with the marker). When items
 * were left out after them, the last text ends with the marker too; all left out →
 * just the marker (AC-92).
 */
function keptTexts(items: readonly RefText[], k: ListKeep): string[] {
  const out = items.slice(0, k.whole).map((i) => i.text);
  const next = items[k.whole];
  const cut = next !== undefined && k.cutChars !== null;
  if (cut) out.push(cutWithMarker(next.text, k.cutChars!));
  const leftOut = items.length - out.length;
  if (leftOut > 0 && !cut) {
    const last = out.pop();
    out.push(last === undefined ? TRUNCATION_MARKER : `${last}\n${TRUNCATION_MARKER}`);
  }
  return out;
}

function renderUser(facts: BriefFacts, p: Prepared, k: Keep): string {
  const parts: string[] = [
    'Write the PR brief for the pull request below. The facts were collected by DevDigest; ' +
      'cite only the file paths listed under "Changed files" and "Caller files".',
  ];
  parts.push(section('PR title', 'pr-title', facts.title || NONE));

  let body: string;
  if (k.bodyChars === null) body = p.bodyCapped ? `${p.body}\n${TRUNCATION_MARKER}` : p.body;
  else body = k.bodyChars > 0 ? cutWithMarker(p.body, k.bodyChars) : TRUNCATION_MARKER;
  parts.push(section('PR description', 'pr-description', body || NONE));

  if (facts.intent) {
    const i = facts.intent;
    const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : NONE);
    parts.push(
      section(
        'Derived intent',
        'intent',
        [
          `Summary: ${i.summary}`,
          `In scope:\n${list(i.in_scope)}`,
          `Out of scope:\n${list(i.out_of_scope)}`,
          `Confidence: ${i.confidence}`,
        ].join('\n'),
      ),
    );
  } else {
    parts.push(section('Derived intent', 'intent', NOT_AVAILABLE));
  }

  if (facts.blast) {
    const b = facts.blast;
    const stats = b.stats
      ? `symbols: ${b.stats.symbols}, callers: ${b.stats.callers}, endpoints: ${b.stats.endpoints}, crons: ${b.stats.crons}`
      : NONE;
    parts.push(section('Blast radius', 'blast-radius', `Summary: ${b.summary}\nStats: ${stats}`));
  } else {
    parts.push(section('Blast radius', 'blast-radius', NOT_AVAILABLE));
  }

  const callers = p.callers.slice(0, k.callers);
  const callersCut = k.callers < p.callers.length || p.callersCapped;
  const callerText = callers.length ? callers.join('\n') : callersCut ? '' : NONE;
  parts.push(
    section(
      'Caller files (blast radius)',
      'blast-callers',
      callersCut ? [callerText, TRUNCATION_MARKER].filter(Boolean).join('\n') : callerText,
    ),
  );

  const files = p.files.slice(0, k.files).map(fileLine);
  const more = p.files.length - k.files;
  if (more > 0) files.push(`… ${more} more files`, TRUNCATION_MARKER);
  parts.push(
    section(
      'Changed files (path · Smart Diff role · +added −deleted · changed lines)',
      'changed-files',
      files.join('\n') || NONE,
    ),
  );

  const issues = keptTexts(p.issues, k.issues);
  parts.push(section('Linked issues', 'linked-issues', issues.length ? issues.join('\n\n') : NONE));

  const docs = keptTexts(p.docs, k.docs);
  parts.push(
    docs.length
      ? docs.map((d) => section('Spec document', 'spec-doc', d)).join('\n\n')
      : section('Spec documents', 'spec-doc', NONE),
  );
  return parts.join('\n\n');
}

/** The largest `n` in [0, max] for which `fits(n)` holds (monotone); 0 if none. */
function largestFitting(max: number, fits: (n: number) => boolean): number {
  if (fits(max)) return max;
  let lo = 0;
  let hi = max - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function changedLines(f: BriefFileFact): number {
  return f.additions + f.deletions;
}

/** Core first, then by changed lines (desc); ties keep the input order. */
function budgetOrder(files: readonly BriefFileFact[]): BriefFileFact[] {
  return files
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        Number(a.f.role !== 'core') - Number(b.f.role !== 'core') ||
        changedLines(b.f) - changedLines(a.f) ||
        a.i - b.i,
    )
    .map(({ f }) => f);
}

export function buildBriefMessages(facts: BriefFacts): BriefMessages {
  const system = `${facts.system}\n\n${INJECTION_GUARD}`;

  const bodyCapped = facts.body.length > BODY_MAX_CHARS;
  const p: Prepared = {
    body: bodyCapped ? facts.body.slice(0, codePointCut(facts.body, BODY_MAX_CHARS)) : facts.body,
    bodyCapped,
    callers: facts.callerFiles.slice(0, MAX_CALLER_FILES).map((path) => callerLine(path, facts.callerLines)),
    callersCapped: facts.callerFiles.length > MAX_CALLER_FILES,
    files: budgetOrder(facts.files),
    issues: facts.issues.map((i) => ({ ref: `#${i.number}`, text: `#${i.number} ${i.title}\n${i.body}` })),
    docs: facts.docs.map((d) => ({ ref: d.path, text: `path: ${d.path}\n\n${d.text}` })),
  };

  const keep: Keep = {
    docs: { whole: p.docs.length, cutChars: null },
    issues: { whole: p.issues.length, cutChars: null },
    bodyChars: null,
    callers: p.callers.length,
    files: p.files.length,
  };
  // One ceiling over both messages (AC-44: ceil(characters / 4) of the whole input).
  const total = (k: Keep) => estTokens(system + renderUser(facts, p, k));
  const fits = (k: Keep) => total(k) <= MAX_INPUT_TOKENS;

  /** Whole items from the end, then the next one cut (if a useful part fits). */
  const shortenList = (key: 'docs' | 'issues') => {
    const texts = p[key];
    if (fits(keep)) return;
    const whole = largestFitting(texts.length, (n) => fits({ ...keep, [key]: { whole: n, cutChars: null } }));
    keep[key] = { whole, cutChars: null };
    const next = texts[whole];
    if (next === undefined) return;
    const chars = largestFitting(next.text.length - 1, (c) => fits({ ...keep, [key]: { whole, cutChars: c } }));
    if (chars >= MIN_CUT_CHARS) keep[key] = { whole, cutChars: chars };
  };

  // (1) spec docs, (2) linked issues
  shortenList('docs');
  shortenList('issues');
  // (3) description
  if (!fits(keep) && p.body) {
    const chars = largestFitting(p.body.length - 1, (c) => fits({ ...keep, bodyChars: c }));
    keep.bodyChars = chars >= MIN_CUT_CHARS ? chars : 0;
  }
  // (4) caller list, (5) changed files
  if (!fits(keep)) keep.callers = largestFitting(p.callers.length, (n) => fits({ ...keep, callers: n }));
  if (!fits(keep)) keep.files = largestFitting(p.files.length, (n) => fits({ ...keep, files: n }));

  const estInputTokens = total(keep);
  if (estInputTokens > MAX_INPUT_TOKENS) return { tooLarge: true, estInputTokens };

  const user = renderUser(facts, p, keep);
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    estInputTokens,
    notes: budgetNotes(p, keep),
  };
}

/** One note per input shortened or left out for the budget, in the cut order (AC-46). */
function budgetNotes(p: Prepared, k: Keep): BriefInputNote[] {
  const notes: BriefInputNote[] = [];
  const listNotes = (input: 'spec_docs' | 'linked_issues', items: readonly RefText[], keep: ListKeep) => {
    items.forEach(({ ref }, i) => {
      if (i < keep.whole) return;
      const reason = i === keep.whole && keep.cutChars !== null ? 'truncated' : 'omitted_budget';
      notes.push({ input, reason, ref });
    });
  };
  listNotes('spec_docs', p.docs, k.docs);
  listNotes('linked_issues', p.issues, k.issues);
  if (k.bodyChars !== null) {
    notes.push({ input: 'pr_description', reason: k.bodyChars > 0 ? 'truncated' : 'omitted_budget' });
  }
  if (k.callers < p.callers.length) {
    notes.push({ input: 'blast_callers', reason: k.callers > 0 ? 'truncated' : 'omitted_budget' });
  }
  if (k.files < p.files.length) {
    notes.push({ input: 'changed_files', reason: k.files > 0 ? 'truncated' : 'omitted_budget' });
  }
  return notes;
}
