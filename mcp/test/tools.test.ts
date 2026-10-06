import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiUnreachableError } from '../src/core/errors.js';
import { FakeApi } from './helpers/fake-api.js';
import { API_URL, connect, textOf } from './helpers/harness.js';
import {
  agentDto,
  conventionDto,
  pullDto,
  repoDto,
  reviewDto,
} from './helpers/fixtures.js';

function data() {
  return new FakeApi({
    agents: [agentDto()],
    repos: [repoDto()],
    pulls: { 'repo-1': [pullDto()] },
    reviews: { 'pr-1': [reviewDto()] },
    conventions: { 'repo-1': [conventionDto()] },
  });
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup(api = data()) {
  const harness = await connect({ api });
  close = harness.close;
  return harness;
}

describe('tools over MCP (in memory)', () => {
  it('list_agents → one minified JSON text block', async () => {
    const { client } = await setup();
    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    const text = textOf(result);
    expect(text).toBe(
      '{"agents":[{"id":"agent-1","name":"Security Reviewer","model":"gpt-4.1-mini","enabled":true}]}',
    );
  });

  it('get_findings → {reviews:[…]}', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/shop', pr: 42 },
    });
    expect(JSON.parse(textOf(result))).toEqual({
      reviews: [
        {
          run_id: 'run-1',
          agent: 'Security Reviewer',
          verdict: 'request_changes',
          score: 55,
          findings: [expect.objectContaining({ severity: 'WARNING', line: '40-44' })],
        },
      ],
    });
  });

  it('get_conventions → {conventions:[…]}', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/shop' },
    });
    expect(JSON.parse(textOf(result))).toEqual({
      conventions: [
        {
          category: 'error-handling',
          rule: 'Throw AppError subclasses from services; never build HTTP errors in routes.',
          file: 'server/src/platform/errors.ts',
        },
      ],
    });
  });

  it('ToolError → isError with the next step', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/nope', pr: 42 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Repo "acme/nope" not found — known repos: acme/shop');
  });

  it('API down → isError naming the URL; the next call still works', async () => {
    const api = data().failWith('listAgents', new ApiUnreachableError(API_URL), { once: true });
    const { client } = await setup(api);
    const down = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(down.isError).toBe(true);
    expect(textOf(down)).toBe(
      `DevDigest API is not reachable at ${API_URL} — start it with ./scripts/dev.sh`,
    );
    const up = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(up.isError).toBeFalsy();
  });

  it('invalid arguments are rejected by the input schema', async () => {
    const { client, api } = await setup();
    const result = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/shop', pr: 'forty-two' },
    });
    expect(result.isError).toBe(true);
    expect(api.calls).toEqual([]);
  });

  it('get_blast_radius → isError, zero API calls', async () => {
    const { client, api } = await setup();
    const result = await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/shop', pr: 42 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Blast radius is not implemented yet in DevDigest.');
    expect(api.calls).toEqual([]);
  });
});

describe('run_agent_on_pr over MCP', () => {
  const review = reviewDto();
  // 7 polls 3 s apart (fake clock): still running at 0–18 s, done at 21 s → progress at 12 s.
  const statuses = ['running', 'running', 'running', 'running', 'running', 'running', 'done'];

  it('returns the reviewView of its run in the same call', async () => {
    const { client } = await setup(data().scriptRun({ statuses, review }));
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/shop', pr: 42, agent: 'agent-1' },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toMatchObject({
      run_id: 'run-started-1',
      agent: 'Security Reviewer',
      verdict: 'request_changes',
      findings: [{ severity: 'WARNING' }],
    });
  });

  it('sends progress notifications when the request carries a progressToken', async () => {
    const { client } = await setup(data().scriptRun({ statuses, review }));
    const progress: unknown[] = [];
    await client.callTool(
      { name: 'run_agent_on_pr', arguments: { repo: 'acme/shop', pr: 42, agent: 'agent-1' } },
      undefined,
      { onprogress: (p) => progress.push(p) },
    );
    expect(progress).toEqual([
      expect.objectContaining({ progress: 12_000, message: 'Review still running (12s)' }),
    ]);
  });

  it('sends no progress notifications without a progressToken', async () => {
    const { client } = await setup(data().scriptRun({ statuses, review }));
    const seen: unknown[] = [];
    client.setNotificationHandler(ProgressNotificationSchema, (n) => {
      seen.push(n);
    });
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/shop', pr: 42, agent: 'agent-1' },
    });
    expect(result.isError).toBeFalsy();
    expect(seen).toEqual([]);
  });

  it('failed run → isError', async () => {
    const { client } = await setup(data().scriptRun({ statuses: ['failed'], error: 'boom' }));
    const result = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/shop', pr: 42, agent: 'agent-1' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/failed: boom — check DevDigest Settings/);
  });
});
