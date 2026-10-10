import { ApiHttpError, ToolError } from './errors.js';
import { blastView, type BlastResult } from './format.js';
import type { DevDigestApi } from './port.js';
import { resolveRepo } from './resolve.js';

export interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

/**
 * A PR's blast radius from the repo-intel index: changed symbols, their callers and the
 * endpoints/crons that may break. Read-only: resolves the repo via `listRepos` and asks the
 * side-effect-free number route — never `listPulls`, which upserts PRs.
 */
export async function getBlastRadius(
  deps: { api: Pick<DevDigestApi, 'listRepos' | 'getBlastRadius'> },
  args: GetBlastRadiusArgs,
): Promise<BlastResult> {
  const repo = await resolveRepo(deps.api, args.repo);
  try {
    return blastView(await deps.api.getBlastRadius(repo.id, args.pr));
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 404) {
      throw new ToolError(
        `PR #${args.pr} not found in ${repo.full_name} — import/sync it in the DevDigest UI`,
      );
    }
    throw err;
  }
}
