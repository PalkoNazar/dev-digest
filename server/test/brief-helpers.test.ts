import { describe, it, expect } from 'vitest';
import { PrBrief } from '@devdigest/shared';
import {
  MAX_CALLER_FILES,
  MAX_FOCUS,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  MAX_RISKS,
  BODY_MAX_CHARS,
  FEATURE_ID,
  LLM_TIMEOUT_MS,
  REASON_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  TITLE_MAX_CHARS,
} from '../src/modules/brief/constants.js';
import {
  capBrief,
  changedRanges,
  estTokens,
  formatRanges,
  groundBrief,
  normalizeRefPath,
} from '../src/modules/brief/helpers.js';
import { BriefDraft, type GroundingSet } from '../src/modules/brief/types.js';
import { makeBrief } from './helpers/brief-fixtures.js';

/**
 * SPEC-03 (L05 PR Brief), plan S6 — pure helpers: changed line ranges, ref path
 * normalisation, grounding against PR files ∪ blast map, caps and cuts.
 * AC-41, AC-50–AC-56, AC-89, AC-94–AC-97, AC-101, EC-12/13/14/18/19/33.
 *
 * Shapes assumed (plan S6 names the functions, not every field):
 * - `changedRanges(patch) → { start, end }[]` (new-side lines, merged, ascending);
 * - `GroundingSet = { prFiles: Map<path, ranges>, blastFiles: Map<path, callerLines> | null }`;
 * - `groundBrief(draft, set)` / `capBrief(grounded)` → `{ summary, risks: Risk[],
 *   review_focus: ReviewFocusItem[], removed }`.
 */

type Draft = ReturnType<typeof BriefDraft.parse>;
type DraftRisk = Draft['risks'][number];
type DraftFocus = Draft['review_focus'][number];

const risk = (file_refs: string[], over: Partial<DraftRisk> = {}): DraftRisk => ({
  kind: 'correctness',
  title: 'A risk',
  explanation: 'Why it matters.',
  severity: 'medium',
  file_refs,
  ...over,
});
const focus = (file: string, line: number | null, reason = 'Look here'): DraftFocus => ({ file, line, reason });
const draft = (over: Partial<Draft> = {}): Draft => ({ summary: 'S', risks: [], review_focus: [], ...over });

/** PR files: ratelimit.ts changed at 12-18 and 40; login.ts at 1-5; logo.png has no patch. */
const SET: GroundingSet = {
  prFiles: new Map([
    ['src/ratelimit.ts', [{ start: 12, end: 18 }, { start: 40, end: 40 }]],
    ['src/login.ts', [{ start: 1, end: 5 }]],
    ['assets/logo.png', []],
  ]),
  blastFiles: new Map([['src/api/auth.ts', [33, 71]]]),
};
const NO_BLAST: GroundingSet = { prFiles: SET.prFiles, blastFiles: null };

describe('brief constants pin the spec limits (AC-42–AC-47, AC-90, AC-94, AC-100)', () => {
  it('has the agreed values', () => {
    expect(MAX_INPUT_TOKENS).toBe(8000);
    expect(MAX_OUTPUT_TOKENS).toBe(2000);
    expect(LLM_TIMEOUT_MS).toBe(90_000);
    expect(BODY_MAX_CHARS).toBe(4000);
    expect(MAX_CALLER_FILES).toBe(30);
    expect(MAX_RISKS).toBe(6);
    expect(MAX_FOCUS).toBe(8);
    expect(SUMMARY_MAX_CHARS).toBe(600);
    expect(TITLE_MAX_CHARS).toBe(120);
    expect(REASON_MAX_CHARS).toBe(300);
    expect(FEATURE_ID).toBe('risk_brief');
  });
});

describe('estTokens (AC-44)', () => {
  it('is ceil(characters / 4)', () => {
    expect(estTokens('')).toBe(0);
    expect(estTokens('abcd')).toBe(1);
    expect(estTokens('abcde')).toBe(2);
    expect(estTokens('x'.repeat(32_000))).toBe(8000);
  });
});

describe('changedRanges / formatRanges (AC-89, AC-41)', () => {
  it('reads new-side ranges of a multi-hunk patch, numbers only', () => {
    const patch = [
      '@@ -10,4 +12,7 @@ export function limit() {',
      ' const a = 1;',
      '+const SECRET_BODY = 2;',
      '@@ -50 +40 @@ class Limiter',
      '+x',
    ].join('\n');
    const ranges = changedRanges(patch);
    expect(ranges).toEqual([
      { start: 12, end: 18 },
      { start: 40, end: 40 },
    ]);
    expect(formatRanges(ranges)).toBe('12-18, 40');
  });

  it('skips a pure-deletion hunk (`+5,0`)', () => {
    const patch = ['@@ -5,3 +5,0 @@', '-a', '-b', '-c', '@@ -20,1 +17,2 @@', '+d', '+e'].join('\n');
    expect(changedRanges(patch)).toEqual([{ start: 17, end: 18 }]);
  });

  it('merges overlapping and adjacent ranges', () => {
    const patch = ['@@ -1,3 +1,3 @@', ' a', '@@ -4,2 +4,2 @@', ' b', '@@ -5,3 +5,4 @@', ' c'].join('\n');
    expect(changedRanges(patch)).toEqual([{ start: 1, end: 8 }]);
  });

  it('returns [] for a null patch (binary / too large)', () => {
    expect(changedRanges(null)).toEqual([]);
    expect(formatRanges([])).toBe('');
  });
});

describe('normalizeRefPath (AC-55, EC-19)', () => {
  it('strips a :line or :line-line suffix and a leading ./', () => {
    expect(normalizeRefPath('src/ratelimit.ts:12-18')).toBe('src/ratelimit.ts');
    expect(normalizeRefPath('src/ratelimit.ts:40')).toBe('src/ratelimit.ts');
    expect(normalizeRefPath('./src/login.ts')).toBe('src/login.ts');
    expect(normalizeRefPath('./src/login.ts:3')).toBe('src/login.ts');
  });

  it('keeps everything else exact', () => {
    expect(normalizeRefPath('src/ratelimit.ts')).toBe('src/ratelimit.ts');
    expect(normalizeRefPath('SRC/ratelimit.ts')).toBe('SRC/ratelimit.ts');
    expect(normalizeRefPath('src/a:b.ts')).toBe('src/a:b.ts');
  });
});

describe('groundBrief — risks (AC-50, AC-51, AC-53)', () => {
  it('keeps refs to PR files, with or without a line suffix or ./', () => {
    const g = groundBrief(draft({ risks: [risk(['src/ratelimit.ts:12-18', './src/login.ts'])] }), SET);
    expect(g.risks).toHaveLength(1);
    expect(g.risks[0]!.file_refs).toHaveLength(2);
    expect(g.risks[0]!.file_refs).toContain('src/ratelimit.ts:12-18'); // shown as path:line-line (AC-9)
    expect(g.removed).toEqual({ risks: 0, file_refs: 0, review_focus: 0 });
  });

  it('removes an invented ref and keeps the risk with its real ref (EC-12)', () => {
    const g = groundBrief(draft({ risks: [risk(['src/ratelimit.ts', 'src/invented.ts'])] }), SET);
    expect(g.risks[0]!.file_refs).toEqual(['src/ratelimit.ts']);
    expect(g.removed.file_refs).toBe(1);
    expect(g.removed.risks).toBe(0);
  });

  it('drops a risk whose refs are all invented (AC-51)', () => {
    const g = groundBrief(
      draft({ risks: [risk(['docs/spec.md', 'src/nowhere.ts'], { title: 'gone' }), risk(['src/login.ts'])] }),
      SET,
    );
    expect(g.risks.map((r) => r.title)).toEqual(['A risk']);
    expect(g.removed.risks).toBe(1);
  });

  it('drops a ref to the old path of a renamed file (EC-18)', () => {
    const g = groundBrief(draft({ risks: [risk(['src/rate-limit-old.ts'])] }), SET);
    expect(g.risks).toEqual([]);
  });

  it('accepts a blast-map file when the blast map is usable', () => {
    const g = groundBrief(draft({ risks: [risk(['src/api/auth.ts:33'])] }), SET);
    expect(g.risks).toHaveLength(1);
  });

  it('grounds against PR files only when the blast map is missing or degraded (AC-53)', () => {
    const g = groundBrief(draft({ risks: [risk(['src/api/auth.ts:33']), risk(['src/login.ts'])] }), NO_BLAST);
    expect(g.risks.map((r) => r.file_refs)).toEqual([['src/login.ts']]);
    expect(g.removed.risks).toBe(1);
  });

  it('counts removed risks, refs and focus items (AC-56)', () => {
    const g = groundBrief(
      draft({
        risks: [risk(['src/login.ts', 'src/fake.ts']), risk([])],
        review_focus: [focus('src/login.ts', 2), focus('src/fake.ts', 1), focus('lib/x.ts', null)],
      }),
      SET,
    );
    expect(g.removed).toEqual({ risks: 1, file_refs: 1, review_focus: 2 });
  });
});

describe('groundBrief — review focus (AC-52, AC-54, AC-97, EC-14, EC-15)', () => {
  it('drops an item whose file is neither a PR file nor a blast file', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/invented.ts', 3), focus('src/login.ts', 2)] }), SET);
    expect(g.review_focus.map((f) => f.file)).toEqual(['src/login.ts']);
    expect(g.removed.review_focus).toBe(1);
  });

  it('keeps a PR-file line inside a changed range unmarked', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/ratelimit.ts', 18), focus('src/ratelimit.ts', 40)] }), SET);
    expect(g.review_focus).toEqual([
      { file: 'src/ratelimit.ts', line: 18, reason: 'Look here', outside_changed_lines: false },
      { file: 'src/ratelimit.ts', line: 40, reason: 'Look here', outside_changed_lines: false },
    ]);
  });

  it('keeps a PR-file line outside every changed range and marks it (AC-54)', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/ratelimit.ts', 19), focus('src/ratelimit.ts', 11)] }), SET);
    expect(g.review_focus.map((f) => [f.line, f.outside_changed_lines])).toEqual([
      [19, true],
      [11, true],
    ]);
  });

  it('keeps a PR-file item without a line unmarked', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/login.ts', null)] }), SET);
    expect(g.review_focus).toEqual([
      { file: 'src/login.ts', line: null, reason: 'Look here', outside_changed_lines: false },
    ]);
  });

  it('keeps a blast-only item on a caller line, and drops the line otherwise (AC-97)', () => {
    const g = groundBrief(
      draft({ review_focus: [focus('src/api/auth.ts', 71), focus('src/api/auth.ts', 72)] }),
      SET,
    );
    expect(g.review_focus).toEqual([
      { file: 'src/api/auth.ts', line: 71, reason: 'Look here', outside_changed_lines: false },
      { file: 'src/api/auth.ts', line: null, reason: 'Look here', outside_changed_lines: false },
    ]);
  });

  it('drops blast-only items when the blast map is missing or degraded (AC-53)', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/api/auth.ts', 71)] }), NO_BLAST);
    expect(g.review_focus).toEqual([]);
    expect(g.removed.review_focus).toBe(1);
  });

  it('matches a ./ path and returns the normalised path (AC-55)', () => {
    const g = groundBrief(draft({ review_focus: [focus('./src/login.ts', 3)] }), SET);
    expect(g.review_focus).toEqual([
      { file: 'src/login.ts', line: 3, reason: 'Look here', outside_changed_lines: false },
    ]);
  });

  it('turns a non-positive model line into null instead of breaking the contract', () => {
    const g = groundBrief(draft({ review_focus: [focus('src/login.ts', 0), focus('src/login.ts', -4)] }), SET);
    expect(g.review_focus.map((f) => f.line)).toEqual([null, null]);
  });

  it('keeps the model order (AC-14)', () => {
    const g = groundBrief(
      draft({ review_focus: [focus('src/login.ts', 2), focus('src/ratelimit.ts', 12), focus('src/api/auth.ts', 33)] }),
      SET,
    );
    expect(g.review_focus.map((f) => f.file)).toEqual(['src/login.ts', 'src/ratelimit.ts', 'src/api/auth.ts']);
  });

  it('can remove everything (EC-13)', () => {
    const g = groundBrief(
      draft({ risks: [risk(['nope.ts'])], review_focus: [focus('nope.ts', 1)] }),
      SET,
    );
    expect(g.risks).toEqual([]);
    expect(g.review_focus).toEqual([]);
    expect(g.removed).toMatchObject({ risks: 1, review_focus: 1 });
  });
});

describe('capBrief (AC-94–AC-96, AC-101, EC-33)', () => {
  const grounded = (d: Draft) => groundBrief(d, SET);

  it('keeps the first 6 of 7 risks and the first 8 of 9 focus items (AC-95)', () => {
    const risks = Array.from({ length: 7 }, (_, i) => risk(['src/login.ts'], { title: `r${i}` }));
    const items = Array.from({ length: 9 }, (_, i) => focus('src/login.ts', i + 1));
    const capped = capBrief(grounded(draft({ risks, review_focus: items })));
    expect(capped.risks.map((r) => r.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(capped.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(capped.removed).toEqual({ risks: 0, file_refs: 0, review_focus: 0 }); // caps are not grounding removals
  });

  it('caps after grounding: invented items do not use up the slots', () => {
    const items = [
      ...Array.from({ length: 3 }, () => focus('src/fake.ts', 1)),
      ...Array.from({ length: 8 }, (_, i) => focus('src/login.ts', i + 1)),
    ];
    const capped = capBrief(grounded(draft({ review_focus: items })));
    expect(capped.review_focus).toHaveLength(8);
    expect(capped.review_focus.every((f) => f.file === 'src/login.ts')).toBe(true);
  });

  it('cuts a 700-char summary to 600 characters + "…" (AC-96)', () => {
    const capped = capBrief(grounded(draft({ summary: 'a'.repeat(700) })));
    expect(capped.summary).toBe(`${'a'.repeat(600)}…`);
  });

  it('leaves a text exactly at its cap untouched', () => {
    const capped = capBrief(
      grounded(
        draft({
          summary: 's'.repeat(600),
          risks: [risk(['src/login.ts'], { title: 't'.repeat(120), explanation: 'e'.repeat(300) })],
          review_focus: [focus('src/login.ts', 1, 'r'.repeat(300))],
        }),
      ),
    );
    expect(capped.summary).toBe('s'.repeat(600));
    expect(capped.risks[0]!.title).toBe('t'.repeat(120));
    expect(capped.risks[0]!.explanation).toBe('e'.repeat(300));
    expect(capped.review_focus[0]!.reason).toBe('r'.repeat(300));
  });

  it('cuts titles at 120 and explanations and reasons at 300, each + "…"', () => {
    const capped = capBrief(
      grounded(
        draft({
          risks: [risk(['src/login.ts'], { title: 't'.repeat(121), explanation: 'e'.repeat(500) })],
          review_focus: [focus('src/login.ts', 1, 'r'.repeat(301))],
        }),
      ),
    );
    expect(capped.risks[0]!.title).toBe(`${'t'.repeat(120)}…`);
    expect(capped.risks[0]!.explanation).toBe(`${'e'.repeat(300)}…`);
    expect(capped.review_focus[0]!.reason).toBe(`${'r'.repeat(300)}…`);
  });

  it('never splits an emoji at the cut (AC-101)', () => {
    const summary = `${'a'.repeat(599)}😀${'b'.repeat(50)}`; // the emoji spans code units 600-601
    const capped = capBrief(grounded(draft({ summary })));
    expect(capped.summary.startsWith('a'.repeat(599))).toBe(true);
    expect(capped.summary.endsWith('…')).toBe(true);
    expect(capped.summary).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(capped.summary.length).toBeLessThanOrEqual(601);
  });

  it('produces risks and focus items the PrBrief contract accepts', () => {
    const capped = capBrief(
      grounded(
        draft({
          risks: [risk(['src/ratelimit.ts:12-18'])],
          review_focus: [focus('src/ratelimit.ts', 99), focus('src/api/auth.ts', 1), focus('src/login.ts', 0)],
        }),
      ),
    );
    const brief = makeBrief({
      summary: capped.summary,
      risks: { risks: capped.risks },
      review_focus: capped.review_focus,
      removed: capped.removed,
    });
    expect(PrBrief.safeParse(brief).success).toBe(true);
  });
});

describe('BriefDraft (AC-48, AC-95/96 — no bounds in the output schema)', () => {
  it('accepts over-long texts and over-many items, so caps cut instead of rejecting', () => {
    const d = draft({
      summary: 'x'.repeat(5000),
      risks: Array.from({ length: 20 }, () => risk(['a.ts'], { title: 't'.repeat(500) })),
      review_focus: Array.from({ length: 20 }, () => focus('a.ts', null, 'r'.repeat(900))),
    });
    expect(BriefDraft.safeParse(d).success).toBe(true);
  });

  it('rejects an answer missing a required field or with an unknown severity', () => {
    expect(BriefDraft.safeParse({ summary: 'x', risks: [] }).success).toBe(false);
    expect(
      BriefDraft.safeParse({ summary: 'x', risks: [risk(['a.ts'], { severity: 'critical' as 'high' })], review_focus: [] })
        .success,
    ).toBe(false);
  });
});
