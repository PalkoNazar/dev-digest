import { ApiHttpError } from '../../src/core/errors.js';
import type { DevDigestApi } from '../../src/core/port.js';
import {
  AgentView,
  BlastView,
  ConventionView,
  PullView,
  RepoView,
  ReviewView,
  RunView,
  type StartedRunView,
} from '../../src/core/views.js';

type Method = keyof DevDigestApi;

function mapValues<T>(
  record: Record<string, T[]> | undefined,
  parse: (item: T) => T,
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, items]) => [key, items.map(parse)]),
  );
}

export interface FakeApiData {
  agents?: AgentView[];
  repos?: RepoView[];
  /** By repo id. */
  pulls?: Record<string, PullView[]>;
  /** By PR id. */
  runs?: Record<string, RunView[]>;
  /** By PR id. */
  reviews?: Record<string, ReviewView[]>;
  /** By repo id. */
  conventions?: Record<string, ConventionView[]>;
  /** By `${repoId}#${prNumber}`; a missing key answers like the API's 404. */
  blast?: Record<string, BlastView>;
}

/** What a run started via `startReview` does over successive `listRuns` calls. */
export interface RunScript {
  /** Status returned by each `listRuns` call; the last one repeats. Default: `['done']`. */
  statuses: string[];
  error?: string | null;
  score?: number | null;
  /** Added to `listReviews` once the run reports `done`. */
  review?: Omit<ReviewView, 'run_id'>;
}

/**
 * In-memory `DevDigestApi`: records every call, serves the given data, scripts the status of
 * started runs, and throws injected errors (`failWith`).
 */
export class FakeApi implements DevDigestApi {
  readonly calls: Array<{ method: Method; args: unknown[] }> = [];
  private readonly data: Required<FakeApiData>;
  private readonly failures = new Map<Method, { error: Error; once: boolean }>();
  private runScript: RunScript = { statuses: ['done'] };
  private readonly started = new Map<string, { prId: string; run: StartedRunView; polls: number }>();
  private nextRun = 1;

  constructor(data: FakeApiData = {}) {
    // Parse through the views like the HTTP adapter does, so full DTO fixtures come back stripped.
    this.data = {
      agents: (data.agents ?? []).map((a) => AgentView.parse(a)),
      repos: (data.repos ?? []).map((r) => RepoView.parse(r)),
      pulls: mapValues(data.pulls, (p) => PullView.parse(p)),
      runs: mapValues(data.runs, (r) => RunView.parse(r)),
      reviews: mapValues(data.reviews, (r) => ReviewView.parse(r)),
      conventions: mapValues(data.conventions, (c) => ConventionView.parse(c)),
      blast: Object.fromEntries(
        Object.entries(data.blast ?? {}).map(([key, b]) => [key, BlastView.parse(b)]),
      ),
    };
  }

  /** Make `method` throw `error` (every call, or only the next one). */
  failWith(method: Method, error: Error, options: { once?: boolean } = {}): this {
    this.failures.set(method, { error, once: options.once ?? false });
    return this;
  }

  /** Script the runs started from now on. */
  scriptRun(script: RunScript): this {
    this.runScript = script;
    return this;
  }

  callsTo(method: Method): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private record(method: Method, args: unknown[]): void {
    this.calls.push({ method, args });
    const failure = this.failures.get(method);
    if (!failure) return;
    if (failure.once) this.failures.delete(method);
    throw failure.error;
  }

  async listAgents(): Promise<AgentView[]> {
    this.record('listAgents', []);
    return this.data.agents;
  }

  async listRepos(): Promise<RepoView[]> {
    this.record('listRepos', []);
    return this.data.repos;
  }

  async listPulls(repoId: string): Promise<PullView[]> {
    this.record('listPulls', [repoId]);
    return this.data.pulls[repoId] ?? [];
  }

  async startReview(prId: string, agentId: string): Promise<StartedRunView> {
    this.record('startReview', [prId, agentId]);
    const agent = this.data.agents.find((a) => a.id === agentId);
    const run: StartedRunView = {
      run_id: `run-started-${this.nextRun++}`,
      agent_id: agentId,
      agent_name: agent?.name ?? agentId,
    };
    this.started.set(run.run_id, { prId, run, polls: 0 });
    return run;
  }

  async listRuns(prId: string): Promise<RunView[]> {
    this.record('listRuns', [prId]);
    const script = this.runScript;
    const runs = [...(this.data.runs[prId] ?? [])];
    for (const entry of this.started.values()) {
      if (entry.prId !== prId) continue;
      const status = script.statuses[Math.min(entry.polls, script.statuses.length - 1)] ?? 'done';
      entry.polls += 1;
      const finished = status !== 'running';
      runs.unshift({
        run_id: entry.run.run_id,
        agent_id: entry.run.agent_id,
        agent_name: entry.run.agent_name,
        status,
        error: finished ? (script.error ?? null) : null,
        score: status === 'done' ? (script.score ?? null) : null,
      });
      if (status === 'done' && script.review) {
        this.addReview(prId, entry.run.run_id, script.review);
      }
    }
    return runs;
  }

  async listReviews(prId: string): Promise<ReviewView[]> {
    this.record('listReviews', [prId]);
    return this.data.reviews[prId] ?? [];
  }

  async listConventions(repoId: string): Promise<ConventionView[]> {
    this.record('listConventions', [repoId]);
    return this.data.conventions[repoId] ?? [];
  }

  async getBlastRadius(repoId: string, number: number): Promise<BlastView> {
    this.record('getBlastRadius', [repoId, number]);
    const blast = this.data.blast[`${repoId}#${number}`];
    if (!blast) {
      throw new ApiHttpError(
        404,
        'not_found',
        `Pull request #${number} not found in this repo — import/sync it in the DevDigest UI`,
      );
    }
    return blast;
  }

  private addReview(prId: string, runId: string, review: Omit<ReviewView, 'run_id'>): void {
    const list = (this.data.reviews[prId] ??= []);
    if (list.some((r) => r.run_id === runId)) return;
    list.unshift(ReviewView.parse({ ...review, run_id: runId }));
  }
}
