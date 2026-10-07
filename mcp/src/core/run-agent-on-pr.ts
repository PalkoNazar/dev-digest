import { ToolError } from './errors.js';
import { reviewView, type ReviewResult } from './format.js';
import type { DevDigestApi } from './port.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { waitForRun, type WaitOptions } from './wait-for-run.js';

export interface RunAgentOnPrArgs {
  repo: string;
  pr: number;
  /** Agent name or id. */
  agent: string;
}

/**
 * Starts one agent's review of an imported PR, waits until the run finishes and returns its
 * review (concise defaults). Resolution happens before the POST, so a bad argument never
 * starts a paid run. A timeout or abort leaves the run going and points at `get_findings`.
 */
export async function runAgentOnPr(
  deps: { api: DevDigestApi },
  args: RunAgentOnPrArgs,
  wait: WaitOptions = {},
): Promise<ReviewResult> {
  const { api } = deps;
  const agent = await resolveAgent(api, args.agent);
  const repo = await resolveRepo(api, args.repo);
  const pull = await resolvePull(api, repo, args.pr);
  const started = await api.startReview(pull.id, agent.id);
  const runId = started.run_id;

  const findingsHint = `get_findings(repo="${repo.full_name}", pr=${pull.number}, run_id="${runId}")`;
  // The run is started and paid for: any later failure must keep its id and must not tell the
  // caller to start another run.
  const afterStart = (err: unknown): ToolError =>
    new ToolError(
      `Review run "${runId}" was started, but waiting for it failed (` +
        `${err instanceof Error ? err.message : String(err)}) — do NOT call run_agent_on_pr ` +
        `again; call ${findingsHint} later`,
    );

  const outcome = await waitForRun(api, pull.id, runId, wait).catch((err: unknown) => {
    throw afterStart(err);
  });
  switch (outcome.status) {
    case 'done': {
      const reviews = await api.listReviews(pull.id).catch((err: unknown) => {
        throw afterStart(err);
      });
      const review = reviews.find((r) => r.run_id === runId);
      if (!review) {
        throw new ToolError(
          `Review run "${runId}" finished but its review is missing — ` +
            `call ${findingsHint}`,
        );
      }
      return { ...reviewView(review), run_id: runId, agent: agent.name };
    }
    case 'failed':
      throw new ToolError(
        `Review run "${runId}" failed: ${outcome.run.error ?? 'unknown error'} — ` +
          'check DevDigest Settings (LLM key/model)',
      );
    case 'cancelled':
      throw new ToolError(
        `Review run "${runId}" was cancelled in DevDigest — call run_agent_on_pr again to retry`,
      );
    case 'timeout':
    case 'aborted':
      throw new ToolError(
        `Review run "${runId}" is still running — call ${findingsHint} later`,
      );
  }
}
