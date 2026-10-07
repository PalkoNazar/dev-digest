import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  SmartDiffRole,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  RunStats,
  Settings,
  Repo,
  PrDetail,
  PrIntentRecord,
  PrIntentResponse,
  FEATURE_MODELS,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ summary: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it.each(['core', 'tests', 'wiring', 'docs', 'boilerplate'])('SmartDiffRole accepts %s', (role) => {
    expect(SmartDiffRole.parse(role)).toBe(role);
  });

  it('SmartDiffRole rejects an unknown role', () => {
    expect(SmartDiffRole.safeParse('misc').success).toBe(false);
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    // Pre-L01 traces have no cost_usd — they must still parse.
    expect(trace.stats.cost_usd).toBeUndefined();
  });

  it('RunStats carries cost_usd (L01), null when the price is unknown', () => {
    const base = { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' };
    expect(RunStats.parse({ ...base, cost_usd: 0.06 }).cost_usd).toBe(0.06);
    expect(RunStats.parse({ ...base, cost_usd: null }).cost_usd).toBeNull();
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        slug: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('intent layer contracts', () => {
  const record = {
    pr_id: 'pr1',
    summary: 'Add session refresh to the login flow.',
    in_scope: ['session refresh'],
    out_of_scope: ['billing'],
    head_sha: 'abc1234',
    confidence: 'medium',
    mode: 'llm',
    missing_context: true,
    context_gaps: ['Linked spec could not be read'],
    sources_used: [
      { kind: 'title', ref: 'title' },
      { kind: 'linked_issue', ref: '#12', title: 'Refresh sessions', truncated: false },
      { kind: 'spec_doc', ref: 'specs/x.md', truncated: true },
    ],
    unresolved_refs: [{ kind: 'doc', ref: 'specs/missing.md', reason: 'not_found' }],
    prompt_components: [
      { component: 'title', chars: 40, est_tokens: 10 },
      { component: 'doc', ref: 'specs/x.md', chars: 6000, est_tokens: 1500, truncated: true },
    ],
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    tokens_in: 2790,
    tokens_out: 180,
    cost_usd: 0.0004,
    fallback_reason: null,
    updated_at: '2026-09-29T10:00:00.000Z',
  };

  it('PrIntentRecord parses a derived record', () => {
    const r = PrIntentRecord.parse(record);
    expect(r.summary).toBe('Add session refresh to the login flow.');
    expect(r.unresolved_refs[0]!.reason).toBe('not_found');
  });

  it('PrIntentRecord parses a fallback record with nulls', () => {
    const r = PrIntentRecord.parse({
      ...record,
      head_sha: null,
      confidence: 'low',
      mode: 'fallback',
      provider: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      fallback_reason: 'no key',
    });
    expect(r.mode).toBe('fallback');
  });

  it('PrIntentResponse accepts a record or null', () => {
    expect(PrIntentResponse.parse({ intent: record, stale: true }).stale).toBe(true);
    expect(PrIntentResponse.parse({ intent: null, stale: false }).intent).toBeNull();
  });

  it('a Finding without scope still parses; scope in/out is accepted', () => {
    const base = {
      id: 'f1',
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      file: 'a.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'r',
      confidence: 0.5,
    };
    expect(Finding.parse(base).scope).toBeUndefined();
    expect(Finding.parse({ ...base, scope: 'out' }).scope).toBe('out');
    expect(() => Finding.parse({ ...base, scope: 'maybe' })).toThrow();
  });

  it('a RunTrace without prompt_assembly.intent still parses', () => {
    const trace = RunTrace.parse({
      config: { agent: 'a', version: 'v1', model: 'm', pr: 1, source: 'local' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    });
    expect(trace.prompt_assembly.intent).toBeUndefined();
  });

  it('review_intent defaults to openrouter deepseek/deepseek-v4-flash', () => {
    const def = FEATURE_MODELS.find((f) => f.id === 'review_intent');
    expect(def?.defaultProvider).toBe('openrouter');
    expect(def?.defaultModel).toBe('deepseek/deepseek-v4-flash');
  });
});
