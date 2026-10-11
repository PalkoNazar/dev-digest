import { describe, it, expect } from 'vitest';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';

/**
 * getPullRequest must page through listFiles / listCommits: GitHub returns at
 * most 100 items per page, and a single page silently dropped every file after
 * the 100th (a 112-file PR reached the reviewers without its last 12 files).
 * GitHub is faked at the fetch level, so the real Octokit paging logic runs.
 */
const REPO = { owner: 'acme', name: 'shop' };
const BASE = 'https://api.github.com';

function json(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(link ? { link } : {}) },
  });
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function fakeGitHub(totalFiles: number, totalCommits: number) {
  const calls: string[] = [];
  const page = <T>(url: URL, items: T[], path: string): Response => {
    const n = Number(url.searchParams.get('page') ?? '1');
    const per = Number(url.searchParams.get('per_page') ?? '30');
    const slice = items.slice((n - 1) * per, n * per);
    const last = Math.ceil(items.length / per);
    const link =
      n < last ? `<${BASE}${path}?per_page=${per}&page=${n + 1}>; rel="next"` : undefined;
    return json(slice, link);
  };
  const fetch = (async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    calls.push(url.pathname + url.search);
    const pr = '/repos/acme/shop/pulls/12';
    if (url.pathname === pr) {
      return json({
        number: 12,
        title: 'Skills',
        user: { login: 'dev' },
        head: { ref: 'feat/l02-skills', sha: 'abc' },
        base: { ref: 'main' },
        additions: 1,
        deletions: 0,
        changed_files: totalFiles,
        state: 'open',
        merged_at: null,
        created_at: '2026-09-27T00:00:00Z',
        updated_at: '2026-09-27T00:00:00Z',
        body: null,
      });
    }
    if (url.pathname === `${pr}/files`) {
      const files = range(0, totalFiles).map((i) => ({
        filename: `src/f${String(i).padStart(3, '0')}.ts`,
        additions: 1,
        deletions: 0,
        patch: '@@ -0,0 +1 @@\n+x',
      }));
      return page(url, files, `${pr}/files`);
    }
    if (url.pathname === `${pr}/commits`) {
      const commits = range(0, totalCommits).map((i) => ({
        sha: `c${i}`,
        commit: { message: `m${i}`, author: { name: 'dev', date: '2026-09-27T00:00:00Z' } },
      }));
      return page(url, commits, `${pr}/commits`);
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetch, calls };
}

describe('OctokitGitHubClient.getPullRequest', () => {
  it('returns every file and commit of a PR larger than one page', async () => {
    const gh = fakeGitHub(112, 101);
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    const pr = await client.getPullRequest(REPO, 12);

    expect(pr.files).toHaveLength(112);
    expect(pr.files.at(-1)?.path).toBe('src/f111.ts');
    expect(pr.commits).toHaveLength(101);
    expect(gh.calls.filter((c) => c.includes('/files'))).toHaveLength(2);
  });

  it('makes one request for a small PR', async () => {
    const gh = fakeGitHub(3, 1);
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    const pr = await client.getPullRequest(REPO, 12);
    expect(pr.files.map((f) => f.path)).toEqual(['src/f000.ts', 'src/f001.ts', 'src/f002.ts']);
    expect(gh.calls.filter((c) => c.includes('/files'))).toHaveLength(1);
  });
});

/** Fetch fake for the intent-layer reads: GraphQL + the contents API. */
function fakeIntentGitHub(routes: {
  graphql?: () => Response;
  contents?: Record<string, () => Response>;
}) {
  const calls: { path: string; search: string; body?: string }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    calls.push({ path: url.pathname, search: url.search, body: init?.body as string | undefined });
    if (url.pathname === '/graphql' && routes.graphql) return routes.graphql();
    const prefix = '/repos/acme/shop/contents/';
    if (url.pathname.startsWith(prefix)) {
      const route = routes.contents?.[decodeURIComponent(url.pathname.slice(prefix.length))];
      if (route) return route();
    }
    return new Response(JSON.stringify({ message: 'Not Found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch, calls };
}

function fileEntry(text: string, size = Buffer.byteLength(text)) {
  return json({
    type: 'file',
    encoding: 'base64',
    size,
    name: 'x.md',
    path: 'specs/x.md',
    content: Buffer.from(text, 'utf8').toString('base64'),
  });
}

describe('OctokitGitHubClient.linkedIssueNumbers', () => {
  it('returns the closing-issue numbers from GraphQL', async () => {
    const gh = fakeIntentGitHub({
      graphql: () =>
        json({
          data: {
            repository: {
              pullRequest: { closingIssuesReferences: { nodes: [{ number: 12 }, { number: 40 }] } },
            },
          },
        }),
    });
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.linkedIssueNumbers(REPO, 7)).toEqual([12, 40]);
    const sent = JSON.parse(gh.calls[0]!.body ?? '{}') as { variables?: Record<string, unknown> };
    expect(sent.variables).toMatchObject({ owner: 'acme', name: 'shop', n: 7 });
  });

  it('returns [] when GraphQL errors', async () => {
    const gh = fakeIntentGitHub({
      graphql: () => json({ data: null, errors: [{ message: 'Resource not accessible by integration' }] }),
    });
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.linkedIssueNumbers(REPO, 7)).toEqual([]);
  });
});

describe('OctokitGitHubClient.getFileAtRef', () => {
  it('base64-decodes a file at the given ref', async () => {
    const gh = fakeIntentGitHub({ contents: { 'specs/x.md': () => fileEntry('# Spec\nDo the thing.') } });
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.getFileAtRef(REPO, 'abc123', 'specs/x.md')).toEqual({ status: 'found', text: '# Spec\nDo the thing.' });
    expect(gh.calls[0]!.search).toContain('ref=abc123');
  });

  it('returns missing on 404', async () => {
    const gh = fakeIntentGitHub({});
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.getFileAtRef(REPO, 'abc123', 'specs/missing.md')).toEqual({ status: 'missing' });
  });

  it('returns too_large for a file above 1 MB', async () => {
    const gh = fakeIntentGitHub({ contents: { 'specs/x.md': () => fileEntry('x', 2_000_000) } });
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.getFileAtRef(REPO, 'abc123', 'specs/x.md')).toEqual({ status: 'too_large' });
  });

  it('returns missing for a directory listing', async () => {
    const gh = fakeIntentGitHub({ contents: { specs: () => json([{ type: 'file', name: 'x.md' }]) } });
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.getFileAtRef(REPO, 'abc123', 'specs')).toEqual({ status: 'missing' });
  });

  it('refuses a path with a .. segment without calling GitHub', async () => {
    const gh = fakeIntentGitHub({});
    const client = new OctokitGitHubClient('token', { fetch: gh.fetch });
    expect(await client.getFileAtRef(REPO, 'abc123', '../../issues/1')).toEqual({ status: 'missing' });
    expect(gh.calls).toHaveLength(0);
  });
});
