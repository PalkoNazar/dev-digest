import type { ConventionStatus } from '@devdigest/shared';
import { DEFAULT_LIMIT } from './constants.js';
import { selectConventions, type ConventionResult } from './format.js';
import type { DevDigestApi } from './port.js';
import { resolveRepo } from './resolve.js';

export interface GetConventionsArgs {
  repo: string;
  status?: ConventionStatus;
  limit?: number;
}

export interface GetConventionsResult {
  conventions: ConventionResult[];
  more?: number;
  hint?: string;
}

/** A repo's extracted conventions with one status (default `accepted`), cut at `limit`. */
export async function getConventions(
  deps: { api: Pick<DevDigestApi, 'listRepos' | 'listConventions'> },
  args: GetConventionsArgs,
): Promise<GetConventionsResult> {
  const status = args.status ?? 'accepted';
  const repo = await resolveRepo(deps.api, args.repo);
  const all = await deps.api.listConventions(repo.id);
  const matching = all.filter((c) => c.status === status);
  if (matching.length === 0) {
    return {
      conventions: [],
      hint:
        `No ${status} conventions for ${repo.full_name} — ` +
        'extract or review them in the DevDigest UI',
    };
  }
  const { items, more, hint } = selectConventions(matching, args.limit ?? DEFAULT_LIMIT);
  return more === undefined ? { conventions: items } : { conventions: items, more, hint };
}
