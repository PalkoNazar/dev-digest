import { describe, expect, it } from 'vitest';
import { ToolError } from '../src/core/errors.js';
import { resolveAgent, resolvePull, resolveRepo } from '../src/core/resolve.js';
import { FakeApi } from './helpers/fake-api.js';
import { agentDto, pullDto, repoDto } from './helpers/fixtures.js';

const repo = repoDto();

function api() {
  return new FakeApi({
    agents: [agentDto(), agentDto({ id: 'agent-2', name: 'Perf Reviewer' })],
    repos: [repo, repoDto({ id: 'repo-2', full_name: 'acme/api' })],
    pulls: { 'repo-1': [pullDto(), pullDto({ id: null, number: 7 })] },
  });
}

describe('resolveAgent', () => {
  it('matches by id', async () => {
    expect((await resolveAgent(api(), 'agent-2')).name).toBe('Perf Reviewer');
  });

  it('matches by case-insensitive name', async () => {
    expect((await resolveAgent(api(), '  perf reviewer ')).id).toBe('agent-2');
  });

  it('miss → ToolError pointing at list_agents', async () => {
    const err = await resolveAgent(api(), 'Nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as Error).message).toBe(
      'Agent "Nope" not found — call list_agents for valid names/ids',
    );
  });

  it('ambiguous name → ToolError asking for the id', async () => {
    const fake = new FakeApi({
      agents: [agentDto(), agentDto({ id: 'agent-3' })],
    });
    await expect(resolveAgent(fake, 'security reviewer')).rejects.toThrow(/ambiguous.*id/);
  });
});

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    expect((await resolveRepo(api(), 'ACME/Shop')).id).toBe('repo-1');
  });

  it('miss → ToolError listing the known repos', async () => {
    await expect(resolveRepo(api(), 'acme/web')).rejects.toThrow(
      'Repo "acme/web" not found — known repos: acme/shop, acme/api',
    );
  });

  it('miss without a slash → reminds of the owner/name shape', async () => {
    await expect(resolveRepo(api(), 'shop')).rejects.toThrow(/use "owner\/name"/);
  });

  it('no repos at all → points at the DevDigest UI', async () => {
    await expect(resolveRepo(new FakeApi(), 'acme/shop')).rejects.toThrow(/DevDigest UI/);
  });

  it('caps the list of known repos', async () => {
    const repos = Array.from({ length: 13 }, (_, i) =>
      repoDto({ id: `r${i}`, full_name: `acme/r${i}` }),
    );
    const err = await resolveRepo(new FakeApi({ repos }), 'acme/x').then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toContain('acme/r9');
    expect(err?.message).not.toContain('acme/r10');
    expect(err?.message).toContain('(+3 more)');
  });
});

describe('resolvePull', () => {
  it('matches by PR number and returns the DB id', async () => {
    const fake = api();
    expect(await resolvePull(fake, repo, 42)).toEqual({
      id: 'pr-1',
      number: 42,
      title: 'Add checkout flow',
    });
    expect(fake.callsTo('listPulls')).toEqual([['repo-1']]);
  });

  it('unknown number → ToolError pointing at the DevDigest UI', async () => {
    await expect(resolvePull(api(), repo, 99)).rejects.toThrow(
      'PR #99 not found in acme/shop — import/sync it in the DevDigest UI',
    );
  });

  it('a PR without a DB id counts as not imported', async () => {
    await expect(resolvePull(api(), repo, 7)).rejects.toBeInstanceOf(ToolError);
  });

  it('API errors propagate unchanged', async () => {
    const boom = new Error('down');
    const fake = api().failWith('listPulls', boom, { once: true });
    await expect(resolvePull(fake, repo, 42)).rejects.toBe(boom);
    expect((await resolvePull(fake, repo, 42)).id).toBe('pr-1');
  });
});
