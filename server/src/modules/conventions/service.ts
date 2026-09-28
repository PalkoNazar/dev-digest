import type {
  ConventionCandidate,
  ConventionScan,
  ConventionUpdate,
  ConventionsList,
} from '@devdigest/shared';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import {
  EXTRACT_JOB_KIND,
  RANKED_POOL,
  SOURCE_SAMPLE_COUNT,
  STALE_SCAN_MS,
  TEST_SAMPLE_COUNT,
} from './constants.js';
import { buildMessages } from './pipeline/prompt.js';
import { refineCandidates } from './pipeline/refine.js';
import { configCandidatePaths, stratify } from './pipeline/sampling.js';
import { toolingFacts, toolingLabels } from './pipeline/tooling.js';
import type { ConventionTarget, ConventionsDeps } from './ports.js';
import { ConventionExtraction, type ExtractJobPayload, type SampleFile } from './types.js';

/**
 * L02 homework — Conventions Extractor. A scan runs as a job: sample files (code),
 * one cheap-model call, then code-side verification (evidence, adherence, tooling)
 * before anything is stored. The user then accepts/rejects/edits candidates; turning
 * them into a skill happens through the skills API.
 */
export class ConventionsService {
  constructor(private readonly deps: ConventionsDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private isStale(scan: ConventionScan): boolean {
    return this.now().getTime() - new Date(scan.started_at).getTime() > STALE_SCAN_MS;
  }

  private async target(workspaceId: string, repoId: string): Promise<ConventionTarget> {
    const target = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!target) throw new NotFoundError(`Repo ${repoId} not found`);
    return target;
  }

  /** Start a scan (409 while one is running); the work happens in the job. */
  async start(workspaceId: string, repoId: string): Promise<ConventionScan> {
    await this.target(workspaceId, repoId);
    const latest = await this.deps.repo.latestScan(workspaceId, repoId);
    if (latest?.status === 'running') {
      if (!this.isStale(latest)) throw new ConflictError('A conventions scan is already running');
      await this.deps.repo.failScan(workspaceId, latest.id, 'Interrupted');
    }
    const scan = await this.deps.repo.createScan(workspaceId, repoId);
    const job = await this.deps.jobs.enqueue(workspaceId, EXTRACT_JOB_KIND, {
      workspaceId,
      repoId,
      scanId: scan.id,
    } satisfies ExtractJobPayload);
    // runScan records its own failures; this only catches the runner giving up
    // (timeout) — the scan must not stay "running" forever.
    job.done.catch((err: unknown) =>
      this.deps.repo
        .failScan(workspaceId, scan.id, errorMessage(err))
        .catch(() => undefined),
    );
    return scan;
  }

  /** Job handler: never throws — a failure is stored on the scan. */
  async runScan(payload: ExtractJobPayload): Promise<void> {
    const { workspaceId, repoId, scanId } = payload;
    try {
      await this.extract(workspaceId, repoId, scanId);
    } catch (err) {
      await this.deps.repo.failScan(workspaceId, scanId, errorMessage(err));
    }
  }

  private async readAll(
    target: ConventionTarget,
    paths: string[],
    kind: SampleFile['kind'],
  ): Promise<SampleFile[]> {
    const read = await Promise.all(
      paths.map(async (path) => ({ path, kind, content: await this.deps.readFile(target, path) })),
    );
    return read.filter((f): f is SampleFile => !!f.content && f.content.trim().length > 0);
  }

  private async extract(workspaceId: string, repoId: string, scanId: string): Promise<void> {
    const target = await this.target(workspaceId, repoId);

    // 1. Samples — code only.
    const [ranked, tests] = await Promise.all([
      this.deps.rankedFiles(repoId, RANKED_POOL),
      this.deps.testFiles(repoId, TEST_SAMPLE_COUNT),
    ]);
    const sources = await this.readAll(target, stratify(ranked, SOURCE_SAMPLE_COUNT), 'source');
    if (sources.length === 0) {
      throw new AppError(
        'not_indexed',
        'No sample files: index the repo first (repo-intel must be enabled and the repo synced)',
        409,
      );
    }
    const samples = [...sources, ...(await this.readAll(target, tests, 'test'))];
    const configs = await this.readAll(target, configCandidatePaths(ranked), 'config');
    const facts = toolingFacts(configs);
    const known = await this.deps.repo.knownRules(workspaceId, repoId);

    // 2. One structured call to the feature's (cheap) model.
    const choice = await this.deps.repo.featureModel(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: 'ConventionExtraction',
      messages: buildMessages({
        system: await this.deps.systemPrompt(),
        repoName: target.fullName,
        samples,
        configs,
        facts,
        known,
      }),
      temperature: 0.2,
      maxRetries: 1,
    });

    // 3. Verify in code: evidence, duplicates, adherence, tooling.
    const files = new Map([...samples, ...configs].map((f) => [f.path, f.content]));
    const { kept, dropped } = await refineCandidates({
      proposed: res.data.conventions,
      files,
      facts,
      known,
      grep: (pattern) => this.deps.grep(target, pattern),
    });

    await this.deps.repo.completeScan(
      workspaceId,
      scanId,
      {
        samplePaths: samples.map((s) => s.path),
        tooling: toolingLabels(facts),
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        proposed: res.data.conventions.length,
        kept: kept.length,
        dropped,
      },
      kept,
    );
  }

  /** Latest scan (a stale `running` one is reported as failed) + all candidates. */
  async list(workspaceId: string, repoId: string): Promise<ConventionsList> {
    await this.target(workspaceId, repoId);
    const [scan, candidates] = await Promise.all([
      this.deps.repo.latestScan(workspaceId, repoId),
      this.deps.repo.list(workspaceId, repoId),
    ]);
    const shown =
      scan?.status === 'running' && this.isStale(scan)
        ? { ...scan, status: 'failed' as const, error: 'Interrupted' }
        : scan;
    return { scan: shown, candidates };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdate,
  ): Promise<ConventionCandidate> {
    const current = await this.deps.repo.get(workspaceId, id);
    if (!current) throw new NotFoundError(`Convention ${id} not found`);
    const edited = patch.rule !== undefined && patch.rule !== current.rule ? true : undefined;
    const updated = await this.deps.repo.update(workspaceId, id, { ...patch, edited });
    if (!updated) throw new NotFoundError(`Convention ${id} not found`);
    return updated;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
