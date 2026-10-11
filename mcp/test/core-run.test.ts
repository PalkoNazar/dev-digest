import { describe, expect, it } from 'vitest';
import { RUN_PROGRESS_EVERY_MS } from '../src/core/constants.js';
import { ApiHttpError, ToolError, toToolMessage } from '../src/core/errors.js';
import { runAgentOnPr } from '../src/core/run-agent-on-pr.js';
import { waitForRun, type WaitOptions } from '../src/core/wait-for-run.js';
import { FakeApi } from './helpers/fake-api.js';
import { fakeClock } from './helpers/harness.js';
import {
  agentDto,
  findingDto,
  pullDto,
  repoDto,
  reviewDto,
  runDto,
} from './helpers/fixtures.js';

const ARGS = { repo: 'acme/shop', pr: 42, agent: 'security reviewer' };

function api() {
  return new FakeApi({
    agents: [agentDto()],
    repos: [repoDto()],
    pulls: { 'repo-1': [pullDto()] },
  });
}

/** Served once the started run is `done` (its `run_id` is replaced by the started run's). */
const review = reviewDto({
  findings: [findingDto({ severity: 'CRITICAL' }), findingDto({ id: 'f2', severity: 'SUGGESTION' })],
});

async function toolError(promise: Promise<unknown>): Promise<string> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ToolError);
  return (err as Error).message;
}

describe('runAgentOnPr', () => {
  it('starts the run with the resolved ids, waits and returns the findings in one call', async () => {
    const fake = api().scriptRun({ statuses: ['running', 'running', 'done'], review });
    const result = await runAgentOnPr({ api: fake }, ARGS, fakeClock());
    expect(fake.callsTo('startReview')).toEqual([['pr-1', 'agent-1']]);
    expect(fake.callsTo('listRuns')).toHaveLength(3);
    expect(result).toEqual({
      run_id: 'run-started-1',
      agent: 'Security Reviewer',
      verdict: 'request_changes',
      score: 55,
      findings: [
        {
          severity: 'CRITICAL',
          file: 'server/src/modules/checkout/service.ts',
          line: '40-44',
          title: 'Total is computed before the discount is applied',
        },
      ],
    });
  });

  it('failed run → ToolError with the run error and Settings', async () => {
    const fake = api().scriptRun({ statuses: ['running', 'failed'], error: 'invalid API key' });
    expect(await toolError(runAgentOnPr({ api: fake }, ARGS, fakeClock()))).toBe(
      'Review run "run-started-1" failed: invalid API key — check DevDigest Settings (LLM key/model)',
    );
  });

  it('cancelled run → ToolError', async () => {
    const fake = api().scriptRun({ statuses: ['cancelled'] });
    expect(await toolError(runAgentOnPr({ api: fake }, ARGS, fakeClock()))).toMatch(
      /was cancelled in DevDigest/,
    );
  });

  it('timeout → still running, points at get_findings with the run id; never cancels', async () => {
    const fake = api().scriptRun({ statuses: ['running'] });
    const message = await toolError(
      runAgentOnPr({ api: fake }, ARGS, { ...fakeClock(), timeoutMs: 30_000 }),
    );
    expect(message).toBe(
      'Review run "run-started-1" is still running — ' +
        'call get_findings(repo="acme/shop", pr=42, run_id="run-started-1") later',
    );
    expect(fake.callsTo('startReview')).toHaveLength(1);
    expect(fake.calls.map((c) => c.method)).not.toContain('listReviews');
  });

  it('abort signal → same "still running" error', async () => {
    const fake = api().scriptRun({ statuses: ['running'] });
    const controller = new AbortController();
    controller.abort();
    const wait = { ...fakeClock(), signal: controller.signal };
    expect(await toolError(runAgentOnPr({ api: fake }, ARGS, wait))).toMatch(/is still running/);
  });

  it('done but review missing → points at get_findings', async () => {
    const fake = api().scriptRun({ statuses: ['done'] });
    expect(await toolError(runAgentOnPr({ api: fake }, ARGS, fakeClock()))).toMatch(
      /finished but its review is missing — call get_findings/,
    );
  });

  it.each(['listRuns', 'listReviews'] as const)(
    'API error from %s after the start keeps the run id and forbids a new start',
    async (method) => {
      const fake = api()
        .scriptRun({ statuses: ['done'] })
        .failWith(method, new ApiHttpError(500, 'internal', 'boom'));
      const message = await toolError(runAgentOnPr({ api: fake }, ARGS, fakeClock()));
      expect(message).toMatch(/run "[^"]+" was started/);
      expect(message).toMatch(/do NOT call run_agent_on_pr again/);
      expect(message).toMatch(/get_findings\(repo="acme\/shop", pr=42, run_id="/);
    },
  );

  it('429 on start → rate-limit message (not a ToolError)', async () => {
    const fake = api().failWith('startReview', new ApiHttpError(429, 'rate_limited', 'Too many'));
    const err = await runAgentOnPr({ api: fake }, ARGS, fakeClock()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(toToolMessage(err, 'http://localhost:3001')).toMatch(/rate limit.*wait a minute/);
  });

  it('unknown agent / repo / PR → ToolError and no POST', async () => {
    for (const args of [
      { ...ARGS, agent: 'nope' },
      { ...ARGS, repo: 'acme/nope' },
      { ...ARGS, pr: 999 },
    ]) {
      const fake = api();
      await expect(runAgentOnPr({ api: fake }, args, fakeClock())).rejects.toThrow(ToolError);
      expect(fake.callsTo('startReview')).toEqual([]);
    }
  });
});

describe('waitForRun', () => {
  function running(prId = 'pr-1') {
    return new FakeApi({ runs: { [prId]: [runDto({ run_id: 'run-1', status: 'running' })] } });
  }

  it('onProgress every RUN_PROGRESS_EVERY_MS of elapsed time while running', async () => {
    const progress: number[] = [];
    const options: WaitOptions = {
      ...fakeClock(),
      pollIntervalMs: 3_000,
      timeoutMs: 35_000,
      onProgress: (ms) => progress.push(ms),
    };
    expect(await waitForRun(running(), 'pr-1', 'run-1', options)).toEqual({ status: 'timeout' });
    expect(RUN_PROGRESS_EVERY_MS).toBe(10_000);
    // Polls at 0, 3, 6, … s: the first poll at or past each 10 s mark reports.
    expect(progress).toEqual([12_000, 21_000, 30_000]);
  });

  it('returns at once for a finished run, without progress', async () => {
    const progress: number[] = [];
    const fake = new FakeApi({ runs: { 'pr-1': [runDto({ status: 'done' })] } });
    const outcome = await waitForRun(fake, 'pr-1', 'run-1', {
      ...fakeClock(),
      onProgress: (ms) => progress.push(ms),
    });
    expect(outcome).toMatchObject({ status: 'done', run: { run_id: 'run-1' } });
    expect(progress).toEqual([]);
  });

  it('missing run → ToolError', async () => {
    await expect(waitForRun(new FakeApi(), 'pr-1', 'run-1', fakeClock())).rejects.toThrow(
      /missing from the PR/,
    );
  });

  it('aborting during a sleep stops the wait', async () => {
    const controller = new AbortController();
    const outcome = await waitForRun(running(), 'pr-1', 'run-1', {
      now: () => 0,
      sleep: async () => controller.abort(),
      signal: controller.signal,
    });
    expect(outcome).toEqual({ status: 'aborted' });
  });
});
