import { describe, expect, it } from 'vitest';
import {
  BLAST_BUDGET_HINT,
  BLAST_DEGRADED_HINT,
  BLAST_RESULT_BUDGET_CHARS,
  CONCISE_TITLE_MAX,
  DEFAULT_LIMIT,
  FINDINGS_BUDGET_HINT,
  FINDINGS_TRUNCATED_HINT,
  REVIEW_RESULT_BUDGET_CHARS,
} from '../src/core/constants.js';
import {
  blastView,
  conventionView,
  filterFindings,
  formatFinding,
  reviewView,
  selectConventions,
  truncate,
} from '../src/core/format.js';
import { blastDto, conventionDto, findingDto, reviewDto } from './helpers/fixtures.js';

describe('formatFinding', () => {
  it('concise = severity, file, "start-end" line, title', () => {
    expect(formatFinding(findingDto())).toEqual({
      severity: 'WARNING',
      file: 'server/src/modules/checkout/service.ts',
      line: '40-44',
      title: 'Total is computed before the discount is applied',
    });
  });

  it('full adds rationale, suggestion and confidence', () => {
    expect(formatFinding(findingDto({ suggestion: undefined }), 'full')).toMatchObject({
      rationale: expect.any(String),
      suggestion: null,
      confidence: 0.8,
    });
  });
});

describe('filterFindings', () => {
  const findings = [
    findingDto({ id: 's', severity: 'SUGGESTION', file: 'a.ts' }),
    findingDto({ id: 'w2', severity: 'WARNING', file: 'b.ts', start_line: 9 }),
    findingDto({ id: 'w1', severity: 'WARNING', file: 'b.ts', start_line: 3 }),
    findingDto({ id: 'c', severity: 'CRITICAL', file: 'z.ts' }),
    findingDto({ id: 'd', severity: 'CRITICAL', dismissed_at: '2026-10-07T00:00:00.000Z' }),
  ];

  it('drops dismissed findings and those below WARNING by default, most severe first', () => {
    expect(filterFindings(findings).map((f) => f.id)).toEqual(['c', 'w1', 'w2']);
  });

  it('honours min_severity', () => {
    expect(filterFindings(findings, 'CRITICAL').map((f) => f.id)).toEqual(['c']);
    expect(filterFindings(findings, 'SUGGESTION').map((f) => f.id)).toEqual(['c', 'w1', 'w2', 's']);
  });
});

describe('truncate', () => {
  it('returns all items without more/hint when within the limit', () => {
    expect(truncate([1, 2], 2, 'h')).toEqual({ items: [1, 2] });
  });

  it('cuts at the limit and reports how many are left', () => {
    expect(truncate([1, 2, 3, 4], 3, 'h')).toEqual({ items: [1, 2, 3], more: 1, hint: 'h' });
  });
});

describe('reviewView', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    findingDto({ id: `f${i}`, start_line: i + 1, end_line: i + 2 }),
  );

  it('defaults to 20 findings and adds more + hint', () => {
    const out = reviewView(reviewDto({ findings: many }));
    expect(out.findings).toHaveLength(DEFAULT_LIMIT);
    expect(out.more).toBe(5);
    expect(out.hint).toBe(FINDINGS_TRUNCATED_HINT);
  });

  it('reviewView maps the review and omits more/hint when nothing was cut', () => {
    const view = reviewView(reviewDto());
    expect(view).toEqual({
      run_id: 'run-1',
      agent: 'Security Reviewer',
      verdict: 'request_changes',
      score: 55,
      findings: [formatFinding(findingDto())],
    });
    expect(view).not.toHaveProperty('more');
  });

  it('reviewView falls back to agent_id for the agent label', () => {
    expect(reviewView(reviewDto({ agent_name: null })).agent).toBe('agent-1');
  });

  it('reviewView passes limit / detail / min_severity through', () => {
    const view = reviewView(reviewDto({ findings: many }), { limit: 2, detail: 'full' });
    expect(view.findings).toHaveLength(2);
    expect(view.findings[0]).toHaveProperty('rationale');
    expect(view.more).toBe(23);
  });

  it('20 concise findings stay within 4,000 chars of minified JSON', () => {
    // Representative data: paths averaging ~50 chars (one deep client path), long rationale and
    // suggestion that concise mode must drop.
    const files = [
      'server/src/modules/reviews/run-executor.ts',
      'client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx',
      'reviewer-core/src/grounding.ts',
      'server/src/modules/conventions/service.ts',
    ];
    const findings = Array.from({ length: 30 }, (_, i) =>
      findingDto({
        id: `f${i}`,
        severity: i % 3 === 0 ? 'CRITICAL' : 'WARNING',
        file: files[i % files.length] ?? 'x.ts',
        start_line: 100 + i * 10,
        end_line: 112 + i * 10,
        // ~70 chars: a typical one-line LLM finding title.
        title: `Unvalidated body reaches the SQL builder without workspace scope #${i}`,
        rationale: 'r'.repeat(600),
        suggestion: 's'.repeat(300),
      }),
    );
    const view = reviewView(reviewDto({ findings, run_id: '0b9c6c0e-3c1f-4f35-9a7c-5b2b8f1e2d4a' }));
    expect(view.findings).toHaveLength(20);
    expect(JSON.stringify(view).length).toBeLessThanOrEqual(4_000);
  });

  it('clips long concise titles; full keeps them', () => {
    const title = `${'Very long LLM finding title that keeps going '.repeat(6)}#1`;
    const review = reviewDto({ findings: [findingDto({ title })] });
    const [concise] = reviewView(review).findings;
    expect(concise?.title).toHaveLength(CONCISE_TITLE_MAX);
    expect(concise?.title.endsWith('…')).toBe(true);
    expect(reviewView(review, { detail: 'full' }).findings[0]?.title).toBe(title);
  });
});

describe('reviewView size budget', () => {
  const DEEP =
    'client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx';
  const MIXED = [
    'server/src/modules/reviews/run-executor.ts',
    DEEP,
    'reviewer-core/src/grounding.ts',
    'server/src/modules/conventions/service.ts',
  ];
  const LONG_TITLE = `${'Very long LLM finding title that keeps going '.repeat(6)}`;
  const QUOTED_TITLE = '"'.repeat(150);
  const RUN_ID = '0b9c6c0e-3c1f-4f35-9a7c-5b2b8f1e2d4a';

  function review(n: number, files: readonly string[], title: string, extra = {}) {
    return reviewDto({
      run_id: RUN_ID,
      findings: Array.from({ length: n }, (_, i) =>
        findingDto({
          id: `f${i}`,
          severity: 'CRITICAL',
          file: files[i % files.length] ?? 'x.ts',
          start_line: 1000 + i,
          end_line: 1200 + i,
          title: `${title}#${i}`,
          ...extra,
        }),
      ),
    });
  }

  const cases = [
    ['mixed paths, long titles', MIXED, LONG_TITLE],
    ['deep paths, long titles', [DEEP], LONG_TITLE],
    ['mixed paths, quoted titles (JSON escaping)', MIXED, QUOTED_TITLE],
    ['deep paths, quoted titles', [DEEP], QUOTED_TITLE],
  ] as const;

  for (const [name, files, title] of cases) {
    it(`concise stays within the budget and counts the rest in more: ${name}`, () => {
      const view = reviewView(review(30, files, title));
      expect(JSON.stringify(view).length).toBeLessThanOrEqual(REVIEW_RESULT_BUDGET_CHARS.concise);
      expect(view.findings.length).toBeGreaterThan(0);
      expect(view.findings.length + (view.more ?? 0)).toBe(30);
    });
  }

  it('says the size cap (not limit) cut the list when the budget bites first', () => {
    const view = reviewView(review(20, [DEEP], QUOTED_TITLE));
    expect(view.findings.length).toBeLessThan(20);
    expect(view.more).toBe(20 - view.findings.length);
    expect(view.hint).toBe(FINDINGS_BUDGET_HINT);
  });

  it('typical data: 20 concise findings fit with no budget cut', () => {
    const view = reviewView(
      review(20, MIXED, 'Unvalidated body reaches the SQL builder without workspace scope '),
    );
    expect(view.findings).toHaveLength(20);
    expect(view.more).toBeUndefined();
  });

  it('full detail uses its own budget and always keeps at least one finding', () => {
    const big = { rationale: 'r'.repeat(20_000), suggestion: 's'.repeat(500) };
    const huge = reviewView(review(3, MIXED, 'T', big), { detail: 'full' });
    expect(huge.findings).toHaveLength(1);
    expect(huge.more).toBe(2);
    const view = reviewView(review(30, [DEEP], LONG_TITLE, { rationale: 'r'.repeat(1_500) }), {
      detail: 'full',
    });
    expect(JSON.stringify(view).length).toBeLessThanOrEqual(REVIEW_RESULT_BUDGET_CHARS.full);
    expect(view.findings.length + (view.more ?? 0)).toBe(30);
  });
});

describe('conventionView / selectConventions', () => {
  it('maps category, rule and the primary evidence file', () => {
    expect(conventionView(conventionDto())).toEqual({
      category: 'error-handling',
      rule: 'Throw AppError subclasses from services; never build HTTP errors in routes.',
      file: 'server/src/platform/errors.ts',
    });
    expect(conventionView(conventionDto({ evidence: [] })).file).toBeNull();
  });

  it('cuts conventions at the limit', () => {
    const list = Array.from({ length: 3 }, (_, i) => conventionDto({ id: `c${i}` }));
    const out = selectConventions(list, 2);
    expect(out.items).toHaveLength(2);
    expect(out.more).toBe(1);
  });
});

describe('blastView', () => {
  it('maps callers to "file:line name" and keeps endpoints and crons apart', () => {
    expect(blastView(blastDto())).toEqual({
      summary: '1 changed symbol · 2 callers · 1 endpoint · 1 cron',
      stats: { symbols: 1, callers: 2, endpoints: 1, crons: 1 },
      index_sha: 'def456',
      symbols: [
        {
          symbol: 'applyDiscount',
          callers: [
            'server/src/modules/checkout/service.ts:40 checkout',
            'server/src/modules/cart/service.ts:12 quote',
          ],
          endpoints: ['POST /checkout'],
          crons: ['0 3 * * *'],
        },
      ],
    });
  });

  it('carries the declaring file when the server sends it', () => {
    const downstream = [
      { symbol: 'handler', file: 'src/a.ts', callers: [], endpoints_affected: [], crons_affected: [] },
    ];
    expect(blastView(blastDto({ downstream })).symbols[0]?.file).toBe('src/a.ts');
  });

  it('degraded carries the reason and a resync hint', () => {
    const summary = 'Index partial — 1 changed symbol';
    const view = blastView(blastDto({ degraded: true, reason: 'index_partial', summary }));
    expect(view).toMatchObject({
      degraded: true,
      reason: 'index_partial',
      hint: BLAST_DEGRADED_HINT,
    });
  });

  it('not degraded → no degraded/reason/hint keys', () => {
    const view = blastView(blastDto({ reason: 'no_data' }));
    expect(view).not.toHaveProperty('degraded');
    expect(view).not.toHaveProperty('reason');
    expect(view).not.toHaveProperty('hint');
  });

  it('30 symbols × 20 callers stay within the budget with more + hint', () => {
    const deep =
      'client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx';
    const downstream = Array.from({ length: 30 }, (_, s) => ({
      symbol: `sharedHelperNumber${s}`,
      callers: Array.from({ length: 20 }, (_, c) => ({
        name: `callerFunction${c}`,
        file: c % 2 ? deep : `server/src/modules/reviews/service-${c}.ts`,
        line: 100 + c,
      })),
      endpoints_affected: ['GET /pulls/:id', 'POST /pulls/:id/review'],
      crons_affected: ['*/5 * * * *'],
    }));
    const view = blastView(blastDto({ downstream, degraded: true, reason: 'index_partial' }));
    expect(JSON.stringify(view).length).toBeLessThanOrEqual(BLAST_RESULT_BUDGET_CHARS);
    expect(view.symbols.length).toBeGreaterThanOrEqual(1);
    expect(view.more).toBe(30 - view.symbols.length);
    expect(view.hint).toBe(`${BLAST_DEGRADED_HINT}; ${BLAST_BUDGET_HINT}`);
    expect(view.reason).toBe('index_partial');
  });

  it('a lone oversized symbol is cut to the budget and still carries the size hint', () => {
    const callers = Array.from({ length: 200 }, (_, c) => ({
      name: `caller${c}`,
      file: `server/src/modules/some/really/long/path/to/a/file-${c}.ts`,
      line: c + 1,
    }));
    const downstream = [{ symbol: 'solo', callers, endpoints_affected: [], crons_affected: [] }];
    const view = blastView(blastDto({ downstream }));
    expect(view.symbols[0]?.truncated).toBe(true);
    expect(view.more).toBeUndefined();
    expect(view.hint).toBe(BLAST_BUDGET_HINT);
    expect(JSON.stringify(view).length).toBeLessThanOrEqual(BLAST_RESULT_BUDGET_CHARS);
  });

  it('keeps at least one symbol even when it alone exceeds the budget', () => {
    const callers = Array.from({ length: 200 }, (_, c) => ({
      name: `caller${c}`,
      file: `server/src/modules/some/really/long/path/to/a/file-${c}.ts`,
      line: c + 1,
    }));
    const downstream = [
      { symbol: 'huge', callers, endpoints_affected: [], crons_affected: [] },
      { symbol: 'next', callers: [], endpoints_affected: [], crons_affected: [] },
    ];
    const view = blastView(blastDto({ downstream }));
    expect(view.symbols.map((s) => s.symbol)).toEqual(['huge']);
    expect(view.symbols[0]?.truncated).toBe(true);
    expect(view.symbols[0]?.callers.length).toBeGreaterThan(0);
    expect(view.symbols[0]?.callers.length).toBeLessThan(200);
    expect(view.more).toBe(1);
    expect(view.hint).toBe(BLAST_BUDGET_HINT);
    expect(JSON.stringify(view).length).toBeLessThanOrEqual(BLAST_RESULT_BUDGET_CHARS);
  });

  it('no downstream → empty symbols, nothing cut', () => {
    const view = blastView(blastDto({ downstream: [] }));
    expect(view.symbols).toEqual([]);
    expect(view).not.toHaveProperty('more');
  });
});
