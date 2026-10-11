import type {
  AgentView,
  BlastView,
  ConventionView,
  PullView,
  RepoView,
  ReviewView,
  RunView,
  StartedRunView,
} from './views.js';

/**
 * The only outside dependency of the MCP server: the DevDigest REST API, in domain terms.
 * Implemented by `api/http.ts`; tests use an in-memory fake. Every method returns parsed views
 * and throws the classes from `errors.ts` (unreachable / HTTP error / unexpected shape).
 */
export interface DevDigestApi {
  listAgents(): Promise<AgentView[]>;
  listRepos(): Promise<RepoView[]>;
  /** PRs of a repo. Note: the API may sync from GitHub first when a token is configured. */
  listPulls(repoId: string): Promise<PullView[]>;
  /** Starts one agent's review run on a PR and returns immediately (the run is async). */
  startReview(prId: string, agentId: string): Promise<StartedRunView>;
  listRuns(prId: string): Promise<RunView[]>;
  listReviews(prId: string): Promise<ReviewView[]>;
  listConventions(repoId: string): Promise<ConventionView[]>;
  /**
   * Blast radius of a PR by repo id + PR number. Side-effect free (unlike `listPulls`): reads the
   * repo-intel index only. Unknown PR → `ApiHttpError` 404.
   */
  getBlastRadius(repoId: string, number: number): Promise<BlastView>;
}
