import { describe, expect, it } from 'vitest';
import { CONCISE_TITLE_MAX, DEFAULT_LIMIT, FINDINGS_TRUNCATED_HINT } from '../src/core/constants.js';
import {
  conventionView,
  filterFindings,
  formatFinding,
  reviewView,
  selectConventions,
  selectFindings,
  truncate,
} from '../src/core/format.js';
import { conventionDto, findingDto, reviewDto } from './helpers/fixtures.js';

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

describe('selectFindings / reviewView', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    findingDto({ id: `f${i}`, start_line: i + 1, end_line: i + 2 }),
  );

  it('defaults to 20 findings and adds more + hint', () => {
    const out = selectFindings(many);
    expect(out.items).toHaveLength(DEFAULT_LIMIT);
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

  it('worst-case titles are clipped in concise mode so 20 findings still fit 4,000 chars', () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      findingDto({
        id: `f${i}`,
        severity: 'CRITICAL',
        file: 'server/src/modules/reviews/run-executor.ts',
        start_line: 1000 + i,
        end_line: 1200 + i,
        title: `${'Very long LLM finding title that keeps going '.repeat(6)}#${i}`,
      }),
    );
    const review = reviewDto({ findings, run_id: '0b9c6c0e-3c1f-4f35-9a7c-5b2b8f1e2d4a' });
    const concise = reviewView(review);
    expect(concise.findings.every((f) => f.title.length <= CONCISE_TITLE_MAX && f.title.endsWith('…'))).toBe(true);
    expect(JSON.stringify(concise).length).toBeLessThanOrEqual(4_000);
    const full = reviewView(review, { detail: 'full' });
    expect(full.findings[0]?.title).toBe(findings[0]?.title);
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
