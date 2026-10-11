import type {
  Agent,
  BlastRadius,
  ConventionCandidate,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';

/**
 * Full API DTOs (as the server sends them, incl. keys the views strip). They are supersets of
 * the core views, so the same builders feed the HTTP adapter tests and the fake API.
 */

export function agentDto(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Security Reviewer',
    description: 'Looks for security issues',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    system_prompt: 'SECRET SYSTEM PROMPT — must never reach a tool result',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    skill_count: 0,
    ...overrides,
  };
}

export function repoDto(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'shop',
    full_name: 'acme/shop',
    default_branch: 'main',
    clone_path: '/home/user/.devdigest/repos/acme/shop',
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

export function pullDto(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pr-1',
    number: 42,
    title: 'Add checkout flow',
    author: 'octocat',
    branch: 'feat/checkout',
    base: 'main',
    head_sha: 'abc123',
    additions: 120,
    deletions: 8,
    files_count: 6,
    status: 'needs_review',
    ...overrides,
  };
}

export function findingDto(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'finding-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Total is computed before the discount is applied',
    file: 'server/src/modules/checkout/service.ts',
    start_line: 40,
    end_line: 44,
    rationale: 'The discount is applied after `total` is read, so customers are overcharged.',
    suggestion: 'Apply the discount before computing `total`.',
    confidence: 0.8,
    kind: 'finding',
    scope: 'in',
    review_id: 'review-1',
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

export function reviewDto(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'One bug in checkout.',
    score: 55,
    model: 'gpt-4.1-mini',
    grounding: '1/1 kept',
    created_at: '2026-10-07T10:00:00.000Z',
    findings: [findingDto()],
    ...overrides,
  };
}

export function runDto(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    status: 'done',
    error: null,
    duration_ms: 12_000,
    tokens_in: 4_000,
    tokens_out: 600,
    cost_usd: 0.004,
    findings_count: 1,
    grounding: '1/1 kept',
    ran_at: '2026-10-07T10:00:00.000Z',
    score: 55,
    blockers: 0,
    ...overrides,
  };
}

export function conventionDto(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'conv-1',
    scan_id: 'scan-1',
    category: 'error-handling',
    rule: 'Throw AppError subclasses from services; never build HTTP errors in routes.',
    evidence: [
      {
        path: 'server/src/platform/errors.ts',
        line_start: 7,
        line_end: 17,
        snippet: 'export class AppError extends Error {',
      },
    ],
    confidence: 0.9,
    adherence: 0.95,
    support_files: 12,
    violation_files: 1,
    enforced_by: null,
    status: 'accepted',
    edited: false,
    skill_id: null,
    created_at: '2026-10-07T10:00:00.000Z',
    ...overrides,
  };
}

export function blastDto(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [
      { name: 'applyDiscount', file: 'server/src/modules/checkout/helpers.ts', kind: 'function' },
    ],
    downstream: [
      {
        symbol: 'applyDiscount',
        callers: [
          { name: 'checkout', file: 'server/src/modules/checkout/service.ts', line: 40 },
          { name: 'quote', file: 'server/src/modules/cart/service.ts', line: 12 },
        ],
        endpoints_affected: ['POST /checkout'],
        crons_affected: ['0 3 * * *'],
      },
    ],
    summary: '1 changed symbol · 2 callers · 1 endpoint · 1 cron',
    degraded: false,
    stats: { symbols: 1, callers: 2, endpoints: 1, crons: 1 },
    index_sha: 'def456',
    ...overrides,
  };
}
