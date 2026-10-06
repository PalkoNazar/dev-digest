import { describe, expect, it } from 'vitest';
import { ToolError } from '../src/core/errors.js';
import { getConventions } from '../src/core/get-conventions.js';
import { getFindings } from '../src/core/get-findings.js';
import { listAgents } from '../src/core/list-agents.js';
import { FakeApi } from './helpers/fake-api.js';
import {
  agentDto,
  conventionDto,
  findingDto,
  pullDto,
  repoDto,
  reviewDto,
  runDto,
} from './helpers/fixtures.js';

const perf = agentDto({ id: 'agent-2', name: 'Perf Reviewer' });

function api(overrides: ConstructorParameters<typeof FakeApi>[0] = {}) {
  return new FakeApi({
    agents: [agentDto(), perf],
    repos: [repoDto()],
    pulls: { 'repo-1': [pullDto()] },
    ...overrides,
  });
}

async function toolError(promise: Promise<unknown>): Promise<string> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ToolError);
  return (err as Error).message;
}

describe('listAgents', () => {
  it('returns id, name, model, enabled only', async () => {
    const result = await listAgents({ api: api() });
    expect(result.agents).toEqual([
      { id: 'agent-1', name: 'Security Reviewer', model: 'gpt-4.1-mini', enabled: true },
      { id: 'agent-2', name: 'Perf Reviewer', model: 'gpt-4.1-mini', enabled: true },
    ]);
    expect(JSON.stringify(result)).not.toContain('SECRET SYSTEM PROMPT');
  });
});

describe('getFindings', () => {
  const older = reviewDto({ id: 'r-old', run_id: 'run-old', created_at: '2026-10-01T00:00:00.000Z' });
  const newer = reviewDto({ id: 'r-new', run_id: 'run-new', verdict: 'approve', findings: [] });
  const perfReview = reviewDto({
    id: 'r-perf',
    run_id: 'run-perf',
    agent_id: 'agent-2',
    agent_name: 'Perf Reviewer',
  });
  const summary = reviewDto({ id: 'r-sum', run_id: 'run-sum', kind: 'summary', agent_id: null });
  const reviews = { 'pr-1': [older, newer, perfReview, summary] };

  it('latest review per agent, kind=review only', async () => {
    const result = await getFindings({ api: api({ reviews }) }, { repo: 'acme/shop', pr: 42 });
    expect(result.reviews.map((r) => r.run_id)).toEqual(['run-new', 'run-perf']);
    expect(result.reviews[0]).toEqual({
      run_id: 'run-new',
      agent: 'Security Reviewer',
      verdict: 'approve',
      score: 55,
      findings: [],
    });
  });

  it('agent filter by name → only that agent', async () => {
    const result = await getFindings(
      { api: api({ reviews }) },
      { repo: 'acme/shop', pr: 42, agent: 'perf reviewer' },
    );
    expect(result.reviews.map((r) => r.run_id)).toEqual(['run-perf']);
  });

  it('run_id → that run, with severity / detail / limit applied', async () => {
    const run = reviewDto({
      run_id: 'run-x',
      findings: [
        findingDto({ id: 'c', severity: 'CRITICAL' }),
        findingDto({ id: 'w', severity: 'WARNING' }),
        findingDto({ id: 's', severity: 'SUGGESTION' }),
      ],
    });
    const result = await getFindings(
      { api: api({ reviews: { 'pr-1': [run] } }) },
      {
        repo: 'acme/shop',
        pr: 42,
        run_id: 'run-x',
        min_severity: 'SUGGESTION',
        detail: 'full',
        limit: 2,
      },
    );
    const [review] = result.reviews;
    expect(review?.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(review?.findings[0]).toHaveProperty('rationale');
    expect(review).toMatchObject({ more: 1 });
  });

  it('run_id still running → "call again later"', async () => {
    const fake = api({ runs: { 'pr-1': [runDto({ run_id: 'run-x', status: 'running' })] } });
    const message = await toolError(
      getFindings({ api: fake }, { repo: 'acme/shop', pr: 42, run_id: 'run-x' }),
    );
    expect(message).toBe('Run "run-x" is still running — call get_findings again later');
  });

  it('run_id of a failed run → the error and run_agent_on_pr', async () => {
    const fake = api({
      runs: { 'pr-1': [runDto({ run_id: 'run-x', status: 'failed', error: 'no API key' })] },
    });
    const message = await toolError(
      getFindings({ api: fake }, { repo: 'acme/shop', pr: 42, run_id: 'run-x' }),
    );
    expect(message).toBe('Run "run-x" failed: no API key — start a new one with run_agent_on_pr');
  });

  it('unknown run_id → omit run_id', async () => {
    const message = await toolError(
      getFindings({ api: api() }, { repo: 'acme/shop', pr: 42, run_id: 'nope' }),
    );
    expect(message).toMatch(/Run "nope" not found on PR #42 in acme\/shop — omit run_id/);
  });

  it('no reviews → "call run_agent_on_pr first"', async () => {
    const message = await toolError(getFindings({ api: api() }, { repo: 'acme/shop', pr: 42 }));
    expect(message).toBe('No reviews of PR #42 in acme/shop yet — call run_agent_on_pr first');
  });

  it('no reviews by that agent → names the agent', async () => {
    const message = await toolError(
      getFindings(
        { api: api({ reviews: { 'pr-1': [older] } }) },
        { repo: 'acme/shop', pr: 42, agent: 'agent-2' },
      ),
    );
    expect(message).toMatch(/^No reviews by agent "Perf Reviewer" of PR #42/);
  });

  it('unknown repo / PR / agent → ToolError with the next step', async () => {
    expect(await toolError(getFindings({ api: api() }, { repo: 'acme/web', pr: 42 }))).toMatch(
      /known repos: acme\/shop/,
    );
    expect(await toolError(getFindings({ api: api() }, { repo: 'acme/shop', pr: 7 }))).toMatch(
      /import\/sync it in the DevDigest UI/,
    );
    expect(
      await toolError(getFindings({ api: api() }, { repo: 'acme/shop', pr: 42, agent: 'x' })),
    ).toMatch(/call list_agents/);
  });
});

describe('getConventions', () => {
  const conventions = {
    'repo-1': [
      conventionDto({ id: 'a1', rule: 'Rule A' }),
      conventionDto({ id: 'a2', rule: 'Rule B', evidence: [] }),
      conventionDto({ id: 'p1', rule: 'Rule P', status: 'pending' }),
    ],
  };

  it('accepted by default → category, rule, file', async () => {
    const result = await getConventions({ api: api({ conventions }) }, { repo: 'acme/shop' });
    expect(result).toEqual({
      conventions: [
        { category: 'error-handling', rule: 'Rule A', file: 'server/src/platform/errors.ts' },
        { category: 'error-handling', rule: 'Rule B', file: null },
      ],
    });
  });

  it('status filter and limit → more + hint', async () => {
    const pending = await getConventions(
      { api: api({ conventions }) },
      { repo: 'acme/shop', status: 'pending' },
    );
    expect(pending.conventions.map((c) => c.rule)).toEqual(['Rule P']);
    const cut = await getConventions({ api: api({ conventions }) }, { repo: 'acme/shop', limit: 1 });
    expect(cut).toMatchObject({ conventions: [{ rule: 'Rule A' }], more: 1, hint: 'raise limit' });
  });

  it('none → empty list with a hint, not an error', async () => {
    const result = await getConventions({ api: api() }, { repo: 'acme/shop' });
    expect(result).toEqual({
      conventions: [],
      hint: 'No accepted conventions for acme/shop — extract or review them in the DevDigest UI',
    });
  });

  it('unknown repo → ToolError', async () => {
    await expect(getConventions({ api: api() }, { repo: 'nope' })).rejects.toThrow(ToolError);
  });
});
