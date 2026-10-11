import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius } from './helpers.js';
import type { BlastDeps, BlastLogger, BlastPull } from './ports.js';

/**
 * Blast radius of a PR: the pull's changed files → one read of the repo-intel
 * index (`BlastSource`) → the `BlastRadius` contract. No LLM, no re-parse, no writes.
 */
export class BlastService {
  constructor(private readonly deps: BlastDeps) {}

  /** By PR id (UI). */
  async forPull(workspaceId: string, prId: string, log?: BlastLogger): Promise<BlastRadius> {
    const pull = await this.deps.repo.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.build(workspaceId, pull, log);
  }

  /** By repo + PR number (MCP) — side-effect free, never imports or syncs the PR. */
  async forPullNumber(
    workspaceId: string,
    repoId: string,
    number: number,
    log?: BlastLogger,
  ): Promise<BlastRadius> {
    const pull = await this.deps.repo.findPullByNumber(workspaceId, repoId, number);
    if (!pull) {
      throw new NotFoundError(
        `Pull request #${number} not found in this repo — import/sync it in the DevDigest UI`,
      );
    }
    return this.build(workspaceId, pull, log);
  }

  private async build(
    workspaceId: string,
    pull: BlastPull,
    log?: BlastLogger,
  ): Promise<BlastRadius> {
    const startedAt = Date.now();
    const files = await this.deps.repo.listChangedFiles(workspaceId, pull.id);
    const result = await this.deps.source.getBlastRadius(pull.repoId, files);
    const blast = toBlastRadius(result);
    log?.info(
      {
        prId: pull.id,
        repoId: pull.repoId,
        changedFiles: files.length,
        source: 'repo-intel-index',
        degraded: blast.degraded,
        reason: blast.reason,
        symbols: blast.stats?.symbols,
        callers: blast.stats?.callers,
        endpoints: blast.stats?.endpoints,
        crons: blast.stats?.crons,
        ms: Date.now() - startedAt,
      },
      'blast: read repo-intel index (no re-parse, no LLM)',
    );
    return blast;
  }
}
