import type { PrBrief } from '@devdigest/shared';

/**
 * SPEC-03 (L05 PR Brief) — a valid stored brief (`PrBrief`) for repository and
 * service tests. Override any top-level field; `run` fields merge.
 */
export function makeBrief(
  overrides: Partial<Omit<PrBrief, 'run'>> & { run?: Partial<PrBrief['run']> } = {},
): PrBrief {
  const { run, ...rest } = overrides;
  return {
    summary: 'Adds a per-user rate limit to the login route.',
    risks: {
      risks: [
        {
          kind: 'security',
          title: 'Limiter keyed by a spoofable header',
          explanation: 'The key comes from X-Forwarded-For.',
          severity: 'high',
          file_refs: ['src/ratelimit.ts:12-18'],
        },
      ],
    },
    review_focus: [
      { file: 'src/ratelimit.ts', line: 14, reason: 'Key derivation', outside_changed_lines: false },
      { file: 'src/login.ts', line: null, reason: 'Wiring of the limiter', outside_changed_lines: false },
    ],
    intent: { summary: 'Rate-limit logins.', in_scope: ['login'], out_of_scope: ['signup'] },
    blast: null,
    inputs: [{ input: 'blast', reason: 'no_data' }],
    removed: { risks: 0, file_refs: 0, review_focus: 0 },
    ...rest,
    run: {
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 3100,
      tokens_out: 420,
      cost_usd: 0.0094,
      duration_ms: 5200,
      est_input_tokens: 3050,
      head_sha: 'sha-a',
      generated_at: '2026-10-21T10:00:00.000Z',
      ...run,
    },
  };
}
