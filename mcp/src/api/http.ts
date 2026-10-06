import { z } from 'zod';
import { ApiHttpError, ApiShapeError, ApiUnreachableError } from '../core/errors.js';
import type { DevDigestApi } from '../core/port.js';
import {
  AgentView,
  ConventionView,
  PullView,
  RepoView,
  ReviewView,
  RunView,
  StartedRunView,
} from '../core/views.js';

/** The subset of `fetch` the adapter uses; the global `fetch` satisfies it. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpApiOptions {
  /** API origin without a trailing slash, e.g. `http://localhost:3001`. */
  baseUrl: string;
  fetch?: FetchLike;
  /** Per-request timeout. */
  timeoutMs?: number;
}

/** Generous: `GET /repos/:id/pulls` may sync from GitHub before it answers. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** DevDigest error envelope: `{ error: { code, message } }`. */
const ErrorEnvelope = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
});
/** Fastify's own error body (e.g. from the rate limiter): `{ statusCode, error, message }`. */
const FastifyErrorBody = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});

const ConventionsBody = z.object({ candidates: z.array(ConventionView) });
const ReviewRunBody = z.object({ runs: z.array(StartedRunView) });

function toHttpError(status: number, body: unknown, fallback: string): ApiHttpError {
  const envelope = ErrorEnvelope.safeParse(body);
  if (envelope.success) {
    const { code, message } = envelope.data.error;
    return new ApiHttpError(status, code ?? 'http_error', message ?? fallback);
  }
  const plain = FastifyErrorBody.safeParse(body);
  if (plain.success) {
    const { code, message, error } = plain.data;
    return new ApiHttpError(status, code ?? 'http_error', message ?? error ?? fallback);
  }
  return new ApiHttpError(status, 'http_error', fallback);
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** HTTP adapter for `DevDigestApi`: fetch + timeout, error envelopes, parse with core views. */
export function createHttpApi(options: HttpApiOptions): DevDigestApi {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    route: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const init: RequestInit = {
      method,
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body !== undefined) {
      init.headers = { accept: 'application/json', 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, init);
    } catch (err) {
      throw new ApiUnreachableError(baseUrl, isTimeout(err) ? 'timeout' : 'unreachable');
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      if (isTimeout(err)) throw new ApiUnreachableError(baseUrl, 'timeout');
      if (!res.ok) throw new ApiHttpError(res.status, 'http_error', res.statusText || route);
      throw new ApiShapeError(route);
    }

    if (!res.ok) throw toHttpError(res.status, json, res.statusText || route);

    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiShapeError(route);
    return parsed.data;
  }

  const id = (value: string) => encodeURIComponent(value);

  return {
    listAgents: () => request('GET', '/agents', 'GET /agents', z.array(AgentView)),
    listRepos: () => request('GET', '/repos', 'GET /repos', z.array(RepoView)),
    listPulls: (repoId) =>
      request('GET', `/repos/${id(repoId)}/pulls`, 'GET /repos/:id/pulls', z.array(PullView)),
    async startReview(prId, agentId) {
      const route = 'POST /pulls/:id/review';
      const { runs } = await request(
        'POST',
        `/pulls/${id(prId)}/review`,
        route,
        ReviewRunBody,
        { agentId },
      );
      const run = runs.find((r) => r.agent_id === agentId) ?? runs[0];
      if (!run) throw new ApiShapeError(route);
      return run;
    },
    listRuns: (prId) =>
      request('GET', `/pulls/${id(prId)}/runs`, 'GET /pulls/:id/runs', z.array(RunView)),
    listReviews: (prId) =>
      request('GET', `/pulls/${id(prId)}/reviews`, 'GET /pulls/:id/reviews', z.array(ReviewView)),
    async listConventions(repoId) {
      const { candidates } = await request(
        'GET',
        `/repos/${id(repoId)}/conventions`,
        'GET /repos/:id/conventions',
        ConventionsBody,
      );
      return candidates;
    },
  };
}
