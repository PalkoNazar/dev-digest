import { describe, expect, it, vi } from 'vitest';
import { createHttpApi, type FetchLike } from '../src/api/http.js';
import { loadConfig } from '../src/config.js';
import {
  ApiHttpError,
  ApiShapeError,
  ApiUnreachableError,
  ToolError,
  toToolMessage,
} from '../src/core/errors.js';
import {
  agentDto,
  blastDto,
  conventionDto,
  pullDto,
  repoDto,
  reviewDto,
  runDto,
} from './helpers/fixtures.js';

const BASE = 'http://localhost:3001';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiWith(handler: FetchLike) {
  const fetch = vi.fn(handler);
  return { api: createHttpApi({ baseUrl: BASE, fetch }), fetch };
}

describe('createHttpApi', () => {
  it('lists agents and strips system_prompt and other unpicked keys', async () => {
    const { api, fetch } = apiWith(async () => json([agentDto()]));
    const agents = await api.listAgents();
    expect(agents).toEqual([
      { id: 'agent-1', name: 'Security Reviewer', model: 'gpt-4.1-mini', enabled: true },
    ]);
    expect(JSON.stringify(agents)).not.toContain('SECRET SYSTEM PROMPT');
    expect(fetch).toHaveBeenCalledWith(`${BASE}/agents`, expect.objectContaining({ method: 'GET' }));
  });

  it('builds the read routes with encoded ids', async () => {
    const bodies: Record<string, unknown> = {
      '/repos': [repoDto()],
      '/repos/r%2F1/pulls': [pullDto()],
      '/pulls/p1/runs': [runDto()],
      '/pulls/p1/reviews': [reviewDto()],
      '/repos/r%2F1/conventions': { scan: null, candidates: [conventionDto()] },
    };
    const { api } = apiWith(async (url) => json(bodies[url.slice(BASE.length)] ?? null, 200));
    expect(await api.listRepos()).toEqual([{ id: 'repo-1', full_name: 'acme/shop' }]);
    expect(await api.listPulls('r/1')).toEqual([
      { id: 'pr-1', number: 42, title: 'Add checkout flow' },
    ]);
    expect((await api.listRuns('p1'))[0]).toEqual({
      run_id: 'run-1',
      agent_id: 'agent-1',
      agent_name: 'Security Reviewer',
      status: 'done',
      error: null,
      score: 55,
    });
    const [review] = await api.listReviews('p1');
    expect(review?.findings[0]).not.toHaveProperty('category');
    expect(review?.findings[0]?.dismissed_at).toBeNull();
    const [convention] = await api.listConventions('r/1');
    expect(convention?.evidence).toEqual([{ path: 'server/src/platform/errors.ts', line_start: 7 }]);
  });

  it('GETs the side-effect-free blast route by repo id + PR number and parses it', async () => {
    const { api, fetch } = apiWith(async () => json(blastDto()));
    const blast = await api.getBlastRadius('r/1', 42);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/repos/r%2F1/pulls/42/blast`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(blast).toEqual(blastDto());
  });

  it('blast 404 envelope → ApiHttpError', async () => {
    const { api } = apiWith(async () =>
      json({ error: { code: 'not_found', message: 'Pull request #7 not found' } }, 404),
    );
    const err = await api.getBlastRadius('repo-1', 7).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('blast body that breaks the contract → ApiShapeError naming the route', async () => {
    const { api } = apiWith(async () => json({ downstream: 'nope' }));
    const err = await api.getBlastRadius('repo-1', 42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiShapeError);
    expect((err as ApiShapeError).route).toBe('GET /repos/:id/pulls/:number/blast');
  });

  it('POSTs {agentId} to start a review and returns the started run', async () => {
    const { api, fetch } = apiWith(async () =>
      json({
        pr_id: 'pr-1',
        runs: [{ run_id: 'run-9', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        reviews: [],
      }),
    );
    const run = await api.startReview('pr-1', 'agent-1');
    expect(run).toEqual({ run_id: 'run-9', agent_id: 'agent-1', agent_name: 'Security Reviewer' });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/pulls/pr-1/review`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ agentId: 'agent-1' });
  });

  it('throws ApiShapeError when a review start returns no run', async () => {
    const { api } = apiWith(async () => json({ pr_id: 'pr-1', runs: [], reviews: [] }));
    await expect(api.startReview('pr-1', 'agent-1')).rejects.toBeInstanceOf(ApiShapeError);
  });

  it('throws ApiUnreachableError when fetch fails', async () => {
    const { api } = apiWith(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).url).toBe(BASE);
    expect((err as ApiUnreachableError).reason).toBe('unreachable');
  });

  it('maps a timeout to ApiUnreachableError(timeout)', async () => {
    const api = createHttpApi({
      baseUrl: BASE,
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    });
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).reason).toBe('timeout');
  });

  it('parses the 404 error envelope', async () => {
    const { api } = apiWith(async () =>
      json({ error: { code: 'not_found', message: 'Pull request not found' } }, 404),
    );
    const err = await api.listRuns('missing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'Pull request not found' });
  });

  it('parses a 429 body from the rate limiter', async () => {
    const { api } = apiWith(async () =>
      json(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 minute',
        },
        429,
      ),
    );
    const err = await api.startReview('pr-1', 'agent-1').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, message: 'Rate limit exceeded, retry in 1 minute' });
  });

  it('keeps the status when an error body is not JSON', async () => {
    const { api } = apiWith(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(502);
  });

  it('throws ApiShapeError on a body that does not match the contract', async () => {
    const { api } = apiWith(async () => json([{ id: 1, name: null }]));
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiShapeError);
    expect((err as ApiShapeError).route).toBe('GET /agents');
  });

  it('throws ApiShapeError on a 200 that is not JSON', async () => {
    const { api } = apiWith(async () => new Response('not json', { status: 200 }));
    await expect(api.listRepos()).rejects.toBeInstanceOf(ApiShapeError);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const fetch = vi.fn<FetchLike>(async () => json([]));
    await createHttpApi({ baseUrl: `${BASE}/`, fetch }).listRepos();
    expect(fetch.mock.calls[0]?.[0]).toBe(`${BASE}/repos`);
  });
});

describe('toToolMessage', () => {
  const url = 'http://localhost:3001';

  it('unreachable → names the URL and ./scripts/dev.sh', () => {
    expect(toToolMessage(new ApiUnreachableError(url), url)).toBe(
      'DevDigest API is not reachable at http://localhost:3001 — start it with ./scripts/dev.sh',
    );
  });

  it('timeout → names the URL and the next step', () => {
    const msg = toToolMessage(new ApiUnreachableError(url, 'timeout'), url);
    expect(msg).toContain(url);
    expect(msg).toContain('./scripts/dev.sh');
  });

  it('429 → wait and retry', () => {
    const msg = toToolMessage(new ApiHttpError(429, 'http_error', 'Rate limit exceeded'), url);
    expect(msg).toMatch(/rate limit/i);
    expect(msg).toContain('retry');
  });

  it('config_error → DevDigest Settings', () => {
    const msg = toToolMessage(new ApiHttpError(500, 'config_error', 'No OpenAI key'), url);
    expect(msg).toContain('No OpenAI key');
    expect(msg).toContain('Settings');
  });

  it('shape error → names the route', () => {
    expect(toToolMessage(new ApiShapeError('GET /agents'), url)).toContain('GET /agents');
  });

  it('ToolError → its own message', () => {
    expect(toToolMessage(new ToolError('Agent "x" not found — call list_agents'), url)).toBe(
      'Agent "x" not found — call list_agents',
    );
  });

  it('other HTTP errors → status, code and message on one line', () => {
    const msg = toToolMessage(new ApiHttpError(404, 'not_found', 'Pull\nrequest  not found'), url);
    expect(msg).toBe('DevDigest API error 404 not_found: Pull request not found');
  });

  it('unknown errors → one line, capped', () => {
    const msg = toToolMessage(new Error(`boom\n${'x'.repeat(1_000)}`), url);
    expect(msg).not.toContain('\n');
    expect(msg.length).toBeLessThan(300);
  });
});

describe('loadConfig', () => {
  it('defaults to http://localhost:3001', () => {
    expect(loadConfig({})).toEqual({ apiUrl: 'http://localhost:3001' });
    expect(loadConfig({ DEVDIGEST_API_URL: '  ' })).toEqual({ apiUrl: 'http://localhost:3001' });
  });

  it('strips trailing slashes', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:4000//' }).apiUrl).toBe(
      'http://127.0.0.1:4000',
    );
  });

  it('rejects an invalid or non-http URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not a url' })).toThrow(/DEVDIGEST_API_URL/);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'file:///etc/passwd' })).toThrow(/http/);
  });

  it('rejects a query or fragment (they would swallow the appended route path)', () => {
    for (const url of [
      'http://localhost:3001?x=1',
      'http://localhost:3001/#frag',
      'http://localhost:3001?',
      'http://localhost:3001#',
    ]) {
      expect(() => loadConfig({ DEVDIGEST_API_URL: url }), url).toThrow(/query or fragment/);
    }
  });
});
