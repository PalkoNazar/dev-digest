import type { Severity } from '@devdigest/shared';
import { ToolError } from './errors.js';
import { reviewView, type Detail, type ReviewResult } from './format.js';
import type { DevDigestApi } from './port.js';
import { resolveAgent, resolvePull, resolveRepo, type ImportedPull } from './resolve.js';
import type { RepoView, ReviewView } from './views.js';

export interface GetFindingsArgs {
  repo: string;
  pr: number;
  /** Agent name or id: only this agent's latest review. Ignored when `run_id` is set. */
  agent?: string;
  /** One run's review. */
  run_id?: string;
  min_severity?: Severity;
  detail?: Detail;
  limit?: number;
}

export interface GetFindingsResult {
  reviews: ReviewResult[];
}

type FindingsApi = Pick<
  DevDigestApi,
  'listAgents' | 'listRepos' | 'listPulls' | 'listRuns' | 'listReviews'
>;

/**
 * Findings of reviews already run on a PR (`kind: review` only): one run's review via `run_id`,
 * else the latest review per agent (optionally of one agent). Never starts a review.
 */
export async function getFindings(
  deps: { api: FindingsApi },
  args: GetFindingsArgs,
): Promise<GetFindingsResult> {
  const { api } = deps;
  const repo = await resolveRepo(api, args.repo);
  const pull = await resolvePull(api, repo, args.pr);
  const reviews = (await api.listReviews(pull.id)).filter((r) => r.kind === 'review');
  const options = { minSeverity: args.min_severity, detail: args.detail, limit: args.limit };

  if (args.run_id) {
    const review = reviews.find((r) => r.run_id === args.run_id);
    if (!review) throw await runMissing(api, repo, pull, args.run_id);
    return { reviews: [reviewView(review, options)] };
  }

  let candidates = reviews;
  let whose = '';
  if (args.agent) {
    const agent = await resolveAgent(api, args.agent);
    candidates = reviews.filter((r) => r.agent_id === agent.id);
    whose = ` by agent "${agent.name}"`;
  }
  const latest = latestPerAgent(candidates);
  if (latest.length === 0) {
    throw new ToolError(
      `No reviews${whose} of PR #${pull.number} in ${repo.full_name} yet — ` +
        'call run_agent_on_pr first',
    );
  }
  return { reviews: latest.map((r) => reviewView(r, options)) };
}

/** Newest review of each agent, newest first. */
function latestPerAgent(reviews: readonly ReviewView[]): ReviewView[] {
  const newestFirst = [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seen = new Set<string>();
  return newestFirst.filter((r) => {
    const key = r.agent_id ?? r.agent_name ?? r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Why a `run_id` has no review yet, phrased with the next step. */
async function runMissing(
  api: Pick<DevDigestApi, 'listRuns'>,
  repo: RepoView,
  pull: ImportedPull,
  runId: string,
): Promise<ToolError> {
  const run = (await api.listRuns(pull.id)).find((r) => r.run_id === runId);
  if (!run) {
    return new ToolError(
      `Run "${runId}" not found on PR #${pull.number} in ${repo.full_name} — ` +
        'omit run_id to get the latest reviews',
    );
  }
  if (run.status === 'failed' || run.status === 'cancelled') {
    const reason = run.error ? `: ${run.error}` : '';
    return new ToolError(
      `Run "${runId}" ${run.status}${reason} — start a new one with run_agent_on_pr`,
    );
  }
  if (run.status === 'done') {
    return new ToolError(
      `Run "${runId}" finished without a review — check the run in the DevDigest UI`,
    );
  }
  return new ToolError(`Run "${runId}" is still running — call get_findings again later`);
}
