import { createHash } from 'node:crypto';
import type {
  Intent,
  IntentConfidence,
  IntentPromptComponent,
  PrIntentRecord,
  UnifiedDiff,
  UnresolvedRef,
} from '@devdigest/shared';
import type { ScopeMode } from '@devdigest/reviewer-core';
import {
  BODY_MAX_CHARS,
  DESCRIPTIVE_BODY_MIN_CHARS,
  DOC_MAX_CHARS,
  FALLBACK_MAX_AREAS,
  GAPS_MAX_ITEMS,
  HUNK_HEADER_MAX_CHARS,
  INTENT_PROMPT_VERSION,
  ISSUE_MAX_CHARS,
  ITEM_MAX_CHARS,
  MAX_FILES,
  MAX_HUNK_HEADERS_PER_FILE,
  SCOPE_MAX_ITEMS,
  STRONG_SOURCE_MIN_CHARS,
  SUMMARY_MAX_CHARS,
  TOTAL_CONTEXT_MAX_CHARS,
  TRIVIAL_TITLE_MAX_CHARS,
} from './constants.js';
import type {
  ContextText,
  FetchedDoc,
  FetchedIssue,
  FileSummary,
  IntentExtraction,
  StoredIntent,
} from './types.js';

/** Intent layer — pure helpers (no I/O). */

/** Rough token estimate from a char count: ceil(chars / 4). */
export function estTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Files, line counts and hunk headers of a diff — the ONLY diff data the
 * classifier gets. Reads `path`, `additions`, `deletions` and the hunk ranges +
 * header; never `diff.raw` or any line of the change body.
 */
export function summarizeDiff(diff: UnifiedDiff): FileSummary[] {
  return diff.files.slice(0, MAX_FILES).map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    hunks: f.hunks.slice(0, MAX_HUNK_HEADERS_PER_FILE).map((h) => {
      const range = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
      const header = h.header?.replace(/\s+/g, ' ').trim().slice(0, HUNK_HEADER_MAX_CHARS);
      return header ? `${range} ${header}` : range;
    }),
  }));
}

// ---- output clamp ----------------------------------------------------------

/** Collapse whitespace; over `max`, cut at the last word boundary and add `…` (never mid-word). */
function oneLine(s: string, max: number): string {
  const line = s.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.(-]+$/, '')}…`;
}

function clampList(items: string[], maxItems: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = oneLine(raw, ITEM_MAX_CHARS);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Summary: one line ≤ 240 chars; lists ≤ 6 items (gaps ≤ 3), each ≤ 120 chars, deduped. */
export function clampIntent(x: IntentExtraction): Intent & { context_gaps: string[] } {
  return {
    summary: oneLine(x.summary, SUMMARY_MAX_CHARS),
    in_scope: clampList(x.in_scope, SCOPE_MAX_ITEMS),
    out_of_scope: clampList(x.out_of_scope, SCOPE_MAX_ITEMS),
    context_gaps: clampList(x.context_gaps, GAPS_MAX_ITEMS),
  };
}

// ---- fallback --------------------------------------------------------------

const GENERIC_TITLES = /^(wip|update[sd]?|fix(es)?|changes?|misc|tmp|test(ing)?|stuff|minor|cleanup|refactor)\b[\s.:!-]*$/i;

/** Too short or a generic word ("WIP", "fix", "update") to describe a goal. */
export function isTrivialTitle(title: string): boolean {
  const t = title.trim();
  return t.length < TRIVIAL_TITLE_MAX_CHARS || GENERIC_TITLES.test(t);
}

/** `feat/add-login_flow` → `add login flow` (type prefix dropped). */
export function humanizeBranch(branch: string): string {
  const last = branch.replace(/^(feat|feature|fix|bugfix|hotfix|chore|refactor|docs|test|ci)\//i, '');
  return last.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Top-level areas of the changed paths (`server/src`, `client`…), most-touched first. */
export function topLevelAreas(files: FileSummary[], max = FALLBACK_MAX_AREAS): string[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const segs = f.path.split('/');
    const area = segs.length >= 3 ? `${segs[0]}/${segs[1]}` : segs.length === 2 ? (segs[0] ?? f.path) : f.path;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([area]) => area);
}

/** Intent without the classifier: title (or branch) + the areas touched. Always low confidence. */
export function fallbackIntent(input: { title: string; branch: string; files: FileSummary[] }): Intent {
  const branch = humanizeBranch(input.branch);
  const summary = !isTrivialTitle(input.title) || !branch ? input.title : branch;
  return {
    summary: oneLine(summary, SUMMARY_MAX_CHARS),
    in_scope: topLevelAreas(input.files).map((a) => `Changes in ${a}`),
    out_of_scope: [],
  };
}

// ---- context budget --------------------------------------------------------

/** Cut `text` to `max`, marking whether anything was dropped. */
function cap(text: string, max: number): ContextText {
  return text.length > max
    ? { text: text.slice(0, Math.max(max, 0)), truncated: true }
    : { text, truncated: false };
}

/**
 * Apply per-source caps (body 4000, issue 3000, doc 6000) and the 20 000-char
 * total budget, filled body → issues → docs. A source with no budget left is
 * returned in `overBudget` (it becomes an unresolved `limit_reached`).
 */
export function budgetContext(input: {
  body: string;
  issues: FetchedIssue[];
  docs: FetchedDoc[];
}): {
  body: ContextText;
  issues: FetchedIssue[];
  docs: FetchedDoc[];
  overBudget: UnresolvedRef[];
} {
  let left = TOTAL_CONTEXT_MAX_CHARS;
  const take = (text: string, max: number, wasTruncated = false): ContextText | null => {
    if (left <= 0 && text.length > 0) return null;
    const c = cap(text, Math.min(max, left));
    left -= c.text.length;
    return { text: c.text, truncated: c.truncated || wasTruncated };
  };
  const overBudget: UnresolvedRef[] = [];
  const body = take(input.body, BODY_MAX_CHARS) ?? { text: '', truncated: input.body.length > 0 };
  const issues: FetchedIssue[] = [];
  for (const i of input.issues) {
    const c = take(i.text, ISSUE_MAX_CHARS, i.truncated);
    if (c) issues.push({ ...i, ...c });
    else overBudget.push({ kind: 'issue', ref: i.ref, reason: 'limit_reached' });
  }
  const docs: FetchedDoc[] = [];
  for (const d of input.docs) {
    const c = take(d.text, DOC_MAX_CHARS, d.truncated);
    if (c) docs.push({ ...d, ...c });
    else overBudget.push({ kind: 'doc', ref: d.path, reason: 'limit_reached' });
  }
  return { body, issues, docs, overBudget };
}

// ---- confidence ------------------------------------------------------------

const LOWER: Record<IntentConfidence, IntentConfidence> = { high: 'medium', medium: 'low', low: 'low' };

/**
 * Evidence-based confidence (never the model's self-report):
 * - high: a resolved issue/doc with ≥ 80 chars AND a non-trivial title or a descriptive body;
 * - medium: a descriptive body (≥ 120 chars), or any resolved issue/doc on its own;
 * - low: only title, branch and files.
 * The model's `evidence_strength: weak` lowers the result by one bucket; it never raises it.
 */
export function scoreConfidence(input: {
  title: string;
  bodyChars: number;
  /** Text lengths of the issues/docs that were actually read. */
  resolvedSourceChars: number[];
  evidenceStrength: IntentExtraction['evidence_strength'] | null;
}): IntentConfidence {
  const descriptiveBody = input.bodyChars >= DESCRIPTIVE_BODY_MIN_CHARS;
  const strongSource = input.resolvedSourceChars.some((n) => n >= STRONG_SOURCE_MIN_CHARS);
  let level: IntentConfidence = 'low';
  if (strongSource && (!isTrivialTitle(input.title) || descriptiveBody)) level = 'high';
  else if (descriptiveBody || input.resolvedSourceChars.length > 0) level = 'medium';
  return input.evidenceStrength === 'weak' ? LOWER[level] : level;
}

/**
 * Context is missing when a referenced source was unreadable or nothing describes
 * the task. Only what the code observed counts: the model's `context_gaps` are
 * shown as notes but never raise this flag (it misread e.g. a plan's own
 * "unverified" list as missing PR context).
 */
export function computeMissingContext(input: {
  unresolved: UnresolvedRef[];
  hasDescriptiveSource: boolean;
}): boolean {
  return input.unresolved.length > 0 || !input.hasDescriptiveSource;
}

// ---- cache + staleness -----------------------------------------------------

/** Cache key of the PR inputs: title, body, branch, head SHA and the prompt version. */
export function intentInputHash(pull: {
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        title: pull.title,
        body: pull.body ?? '',
        branch: pull.branch,
        head_sha: pull.headSha,
        v: INTENT_PROMPT_VERSION,
      }),
    )
    .digest('hex');
}

/** The PR changed (title/body/branch/head) since the stored intent was derived. */
export function isStale(
  stored: StoredIntent | null,
  pull: { title: string; body: string | null; branch: string; headSha: string },
): boolean {
  if (!stored) return false;
  return stored.inputHash !== intentInputHash(pull);
}

// ---- review side -----------------------------------------------------------

/**
 * The intent block given to every reviewer (reviewer-core wraps it as untrusted):
 * summary, in/out-of-scope bullets, confidence with its sources, missing context.
 */
export function renderIntentForPrompt(rec: PrIntentRecord): string {
  const bullets = (items: string[]) => (items.length > 0 ? items.map((i) => `- ${i}`).join('\n') : '- (none stated)');
  const sources = rec.sources_used
    .map((s) => (s.kind === 'linked_issue' || s.kind === 'mentioned_issue' ? `issue ${s.ref}` : s.kind === 'spec_doc' ? s.ref : s.kind))
    .join(', ');
  const lines = [
    `Summary: ${rec.summary}`,
    `In scope:\n${bullets(rec.in_scope)}`,
    `Out of scope:\n${bullets(rec.out_of_scope)}`,
    `Confidence: ${rec.confidence}${rec.mode === 'fallback' ? ' (fallback — not derived by the classifier)' : ''}${sources ? ` (sources: ${sources})` : ''}`,
  ];
  if (rec.missing_context) {
    const gaps = [
      ...rec.unresolved_refs.map((u) => `${u.kind} ${u.ref} (${u.reason})`),
      ...rec.context_gaps,
    ];
    lines.push(`Missing context: ${gaps.length > 0 ? gaps.join('; ') : 'no task description'}`);
  }
  return lines.join('\n');
}

/** `enforce` only for a classifier intent with medium/high confidence; `tag` otherwise; none without intent. */
export function scopeModeFor(rec: PrIntentRecord | null | undefined): ScopeMode | undefined {
  if (!rec) return undefined;
  return rec.mode === 'llm' && (rec.confidence === 'medium' || rec.confidence === 'high')
    ? 'enforce'
    : 'tag';
}

/** `title ~12 · body ~310 · issue #12 ~420 · doc specs/x.md ~1500 · branch ~6 · files(34)+hunks ~600`. */
export function formatComponents(components: IntentPromptComponent[]): string {
  return components
    .map((c) => {
      const name =
        c.component === 'files'
          ? `files(${c.ref ?? 0})+hunks`
          : c.ref && (c.component === 'issue' || c.component === 'doc')
            ? `${c.component} ${c.ref}`
            : c.component;
      return `${name} ~${c.est_tokens}${c.truncated ? ' (truncated)' : ''}`;
    })
    .join(' · ');
}
