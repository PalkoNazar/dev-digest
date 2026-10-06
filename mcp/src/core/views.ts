import {
  Agent,
  ConventionCandidate,
  ConventionEvidence,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunTarget,
  RunSummary,
} from '@devdigest/shared';
import { z } from 'zod';

/**
 * The slices of the DevDigest API contracts this package reads. Each view is a `.pick()` of the
 * shared contract, so it stays in sync with the server and strips every other key on parse:
 * an agent's `system_prompt`, a repo's `clone_path` etc. never reach a tool result.
 */

export const AgentView = Agent.pick({ id: true, name: true, model: true, enabled: true });
export type AgentView = z.infer<typeof AgentView>;

export const RepoView = Repo.pick({ id: true, full_name: true });
export type RepoView = z.infer<typeof RepoView>;

export const PullView = PrMeta.pick({ id: true, number: true, title: true });
export type PullView = z.infer<typeof PullView>;

export const StartedRunView = ReviewRunTarget.pick({
  run_id: true,
  agent_id: true,
  agent_name: true,
});
export type StartedRunView = z.infer<typeof StartedRunView>;

export const RunView = RunSummary.pick({
  run_id: true,
  agent_id: true,
  agent_name: true,
  status: true,
  error: true,
  score: true,
});
export type RunView = z.infer<typeof RunView>;

export const FindingView = FindingRecord.pick({
  id: true,
  severity: true,
  title: true,
  file: true,
  start_line: true,
  end_line: true,
  rationale: true,
  suggestion: true,
  confidence: true,
  dismissed_at: true,
});
export type FindingView = z.infer<typeof FindingView>;

export const ReviewView = ReviewRecord.pick({
  id: true,
  run_id: true,
  agent_id: true,
  agent_name: true,
  kind: true,
  verdict: true,
  score: true,
  created_at: true,
}).extend({ findings: z.array(FindingView) });
export type ReviewView = z.infer<typeof ReviewView>;

export const ConventionView = ConventionCandidate.pick({
  id: true,
  category: true,
  rule: true,
  status: true,
}).extend({ evidence: z.array(ConventionEvidence.pick({ path: true, line_start: true })) });
export type ConventionView = z.infer<typeof ConventionView>;
