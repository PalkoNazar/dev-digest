import { MAX_KNOWN_REPOS_IN_ERROR } from './constants.js';
import { ToolError } from './errors.js';
import type { DevDigestApi } from './port.js';
import type { AgentView, PullView, RepoView } from './views.js';

/** Turns the model's flat arguments (agent name/id, "owner/name", PR number) into API ids. */

/** A PR that exists in DevDigest's DB (has an id the review routes accept). */
export type ImportedPull = PullView & { id: string };

/** By exact id, else by case-insensitive name. Miss or ambiguous name → `ToolError`. */
export async function resolveAgent(
  api: Pick<DevDigestApi, 'listAgents'>,
  ref: string,
): Promise<AgentView> {
  const agents = await api.listAgents();
  const wanted = ref.trim();
  const byId = agents.find((a) => a.id === wanted);
  if (byId) return byId;
  const byName = agents.filter((a) => a.name.toLowerCase() === wanted.toLowerCase());
  if (byName.length > 1) {
    throw new ToolError(`Agent name "${wanted}" is ambiguous — pass its id from list_agents`);
  }
  const [agent] = byName;
  if (!agent) {
    throw new ToolError(`Agent "${wanted}" not found — call list_agents for valid names/ids`);
  }
  return agent;
}

/** By case-insensitive `full_name` ("owner/name"). Miss → `ToolError` listing known repos. */
export async function resolveRepo(
  api: Pick<DevDigestApi, 'listRepos'>,
  fullName: string,
): Promise<RepoView> {
  const repos = await api.listRepos();
  const wanted = fullName.trim().toLowerCase();
  const repo = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (repo) return repo;

  const shape = fullName.includes('/') ? '' : ' (use "owner/name")';
  if (repos.length === 0) {
    throw new ToolError(
      `Repo "${fullName}" not found${shape} — no repos are imported; add it in the DevDigest UI`,
    );
  }
  const names = repos.slice(0, MAX_KNOWN_REPOS_IN_ERROR).map((r) => r.full_name);
  const rest = repos.length - names.length;
  const known = names.join(', ') + (rest > 0 ? ` (+${rest} more)` : '');
  throw new ToolError(`Repo "${fullName}" not found${shape} — known repos: ${known}`);
}

/** By PR number within the repo. Not imported (or no DB id) → `ToolError`. */
export async function resolvePull(
  api: Pick<DevDigestApi, 'listPulls'>,
  repo: RepoView,
  number: number,
): Promise<ImportedPull> {
  const pulls = await api.listPulls(repo.id);
  const pull = pulls.find((p) => p.number === number);
  if (!pull || !pull.id) {
    throw new ToolError(
      `PR #${number} not found in ${repo.full_name} — import/sync it in the DevDigest UI`,
    );
  }
  return { ...pull, id: pull.id };
}
