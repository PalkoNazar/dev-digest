import type {
  FeatureModelChoice,
  OnboardingCriticalPath,
  OnboardingGeneration,
  OnboardingIndexSnapshot,
  OnboardingSkeletonReason,
  OnboardingTour,
  OnboardingView,
  StructuredResult,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  NotFoundError,
  redactSecrets,
} from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import {
  EXCLUDED_DIRS,
  FILE_RANK_CHUNK,
  GENERATE_JOB_KIND,
  LLM_ADAPTER_GRACE_MS,
  LLM_TIMEOUT_MS,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  READING_PATH_POOL,
  REPO_MAP_TOKENS,
  ROUTES_MAX,
  ROUTE_SEED_FILES,
  SIGNATURE_FILES,
  STALE_GENERATION_MS,
} from './constants.js';
import {
  capReadme,
  composeServices,
  detectPackageManager,
  detectStack,
  findComposeFile,
  hasEnvExample,
  parseScripts,
  readingPath,
  readmePath,
  routesFromBlast,
  sourceCandidates,
  topLevelFolders,
} from './helpers/facts.js';
import { buildTourMessages } from './helpers/prompt.js';
import { buildSkeleton, criticalEntries, mergeDraft, type TourSections } from './helpers/tour.js';
import type {
  CompleteOutcome,
  OnboardingDeps,
  OnboardingTarget,
  TourIndexState,
} from './ports.js';
import {
  TourDraft,
  type GenerateJobPayload,
  type ScriptsByDir,
  type TourFacts,
  type TourSignature,
} from './types.js';

/**
 * L05 Onboarding Tour (SPEC-02), plan S11. `start` creates a generation and
 * enqueues the job; `run` (the job) collects facts deterministically, makes at most
 * ONE structured LLM call, grounds everything against the tree at the tour's commit
 * and stores the tour through a status-guarded write; `view` only reads.
 */

const INTERRUPTED = 'Interrupted';
const FINISHED_MSG = 'onboarding tour generation finished';
const PACKAGE_JSON = 'package.json';
/** Nested `package.json` files read for scripts (the shallowest first). */
const NESTED_PACKAGE_JSON_MAX = 20;
const DETAIL_MAX_CHARS = 500;

/** Why the tour fell back to the skeleton, plus a short honest detail. */
interface SkeletonCause {
  reason: OnboardingSkeletonReason;
  detail: string | null;
}

/** The LLM call's metadata, when one was made. */
interface CallMeta {
  calls: 0 | 1;
  model: string | null;
  result: StructuredResult<TourDraft> | null;
}

/** Fields of the one "finished" log line (AC-34): ids, counts, model, cost — no repo text. */
interface FinishedLog {
  repoId: string;
  repo: string | null;
  llm_calls: number;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  kind: OnboardingTour['kind'] | null;
  reason: OnboardingSkeletonReason | null;
  outcome: CompleteOutcome | 'failed';
}

export class OnboardingService {
  constructor(private readonly deps: OnboardingDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private isStale(gen: OnboardingGeneration): boolean {
    return this.now().getTime() - new Date(gen.started_at).getTime() > STALE_GENERATION_MS;
  }

  private async target(workspaceId: string, repoId: string): Promise<OnboardingTarget> {
    const target = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!target) throw new NotFoundError(`Repo ${repoId} not found`);
    return target;
  }

  // ---------------------------------------------------------------- view

  /** Reads only: no LLM, no tree, no fact collection (AC-32). */
  async view(workspaceId: string, repoId: string): Promise<OnboardingView> {
    const target = await this.target(workspaceId, repoId);
    const [tour, latest, indexing, state] = await Promise.all([
      this.deps.repo.getTour(workspaceId, repoId),
      this.deps.repo.latestGeneration(workspaceId, repoId),
      this.deps.repo.indexingInProgress(workspaceId, repoId),
      this.deps.intel.getIndexState(repoId),
    ]);
    return {
      repo_id: repoId,
      tour,
      generation: latest ? this.shown(latest) : null,
      clone_ready: target.clonePath != null,
      indexing,
      current_commit_sha: state.lastIndexedSha || null,
    };
  }

  /** A stale `running` row, or a `failed` + Interrupted one, reads as interrupted (AC-18, A4). */
  private shown(gen: OnboardingGeneration): OnboardingGeneration {
    const interrupted =
      (gen.status === 'running' && this.isStale(gen)) ||
      (gen.status === 'failed' && gen.detail === INTERRUPTED);
    return interrupted ? { ...gen, status: 'interrupted' } : gen;
  }

  // ---------------------------------------------------------------- start

  /** Starts a generation (202); 409 while one runs or without a clone (AC-12, AC-14, AC-51). */
  async start(workspaceId: string, repoId: string): Promise<OnboardingGeneration> {
    const target = await this.target(workspaceId, repoId);
    // an empty clone (no commit) makes `ls-tree HEAD` reject: not ready either (AC-51)
    const headTree = target.clonePath
      ? await this.deps.git.listTree(target, 'HEAD').catch(() => null)
      : null;
    if (headTree === null) {
      throw new AppError('clone_not_ready', 'The repository clone is not ready — resync the repo first', 409);
    }
    const latest = await this.deps.repo.latestGeneration(workspaceId, repoId);
    if (latest?.status === 'running') {
      if (!this.isStale(latest)) throw new ConflictError('An onboarding tour generation is already running');
      // the one-running index allows a single running row: close the stale one first (AC-19)
      await this.deps.repo.failGeneration(workspaceId, latest.id, INTERRUPTED);
    }
    const gen = await this.deps.repo.createGeneration(workspaceId, repoId);
    let job: Awaited<ReturnType<OnboardingDeps['jobs']['enqueue']>>;
    try {
      job = await this.deps.jobs.enqueue(workspaceId, GENERATE_JOB_KIND, {
        workspaceId,
        repoId,
        generationId: gen.id,
      } satisfies GenerateJobPayload);
    } catch (err) {
      // no job will ever finish this generation — don't leave it blocking the next one
      await this.deps.repo.failGeneration(workspaceId, gen.id, errorMessage(err));
      throw err;
    }
    // `run` records its own failures; this only catches the runner giving up (timeout).
    job.done.catch((err: unknown) =>
      this.deps.repo.failGeneration(workspaceId, gen.id, errorMessage(err)).catch(() => undefined),
    );
    return gen;
  }

  // ---------------------------------------------------------------- run (the job)

  /** Job handler: never rejects. Exactly one "finished" log line per run (AC-34). */
  async run(payload: GenerateJobPayload): Promise<void> {
    const { workspaceId, repoId, generationId } = payload;
    const line: FinishedLog = {
      repoId,
      repo: null,
      llm_calls: 0,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      kind: null,
      reason: null,
      outcome: 'failed',
    };
    try {
      const target = await this.deps.repo.findRepo(workspaceId, repoId);
      if (!target) {
        // the repo was removed: its generation row went with it (AC-23)
        line.outcome = 'discarded';
      } else {
        line.repo = target.fullName;
        const tour = await this.generate(workspaceId, target);
        Object.assign(line, {
          llm_calls: tour.llm_calls,
          model: tour.model,
          tokens_in: tour.tokens_in,
          tokens_out: tour.tokens_out,
          cost_usd: tour.cost_usd,
          kind: tour.kind,
          reason: tour.skeleton_reason,
        });
        line.outcome = await this.deps.repo.completeGeneration(workspaceId, generationId, tour);
      }
    } catch (err) {
      // Q5: a non-LLM failure fails the generation; the stored tour is untouched.
      line.outcome = 'failed';
      await this.deps.repo
        .failGeneration(workspaceId, generationId, errorMessage(err))
        .catch(() => undefined);
    }
    this.deps.log.info(line, FINISHED_MSG);
  }

  private async generate(workspaceId: string, target: OnboardingTarget): Promise<OnboardingTour> {
    const repoId = target.id;

    // 1. Index state → commit + snapshot (AC-54, AC-68).
    const state = await this.deps.intel.getIndexState(repoId);
    const snapshot = this.snapshot(state);

    // 2. The tree at the commit; a pruned commit falls back to HEAD (A10).
    let commitSha = state.lastIndexedSha || (await this.deps.git.currentHead(target));
    // `git ls-tree <missing ref>` rejects (the adapter returns null only without a clone):
    // both mean "this commit isn't readable" → fall back. Only a HEAD failure is fatal.
    let tree = await this.deps.git.listTree(target, commitSha).catch(() => null);
    if (tree === null) {
      tree = await this.deps.git.listTree(target, 'HEAD');
      if (tree === null) {
        throw new AppError('clone_not_ready', 'The repository clone is not readable', 409);
      }
      commitSha = await this.deps.git.currentHead(target);
    }
    const treePaths = tree.map((e) => e.path);
    const fileSet: ReadonlySet<string> = new Set(treePaths);
    const candidates = sourceCandidates(treePaths);
    const languagesIndexed = candidates.length > 0;

    // 3. Decide (AC-39, AC-44, AC-75): no index data for the LLM call to stand on → skeleton.
    const indexCause = languagesIndexed ? this.indexCause(snapshot) : null;
    // importer counts only from a usable index; degraded/failed/off → null, never 0 (AC-70)
    const countsKnown = snapshot.status === 'full' || snapshot.status === 'partial';

    // 4. Facts, with no LLM call (AC-24).
    const facts = await this.collectFacts({
      target,
      commitSha,
      treePaths,
      fileSet,
      candidates,
      languagesIndexed,
      snapshot,
      withLlmFacts: indexCause === null,
    });
    let entries: OnboardingCriticalPath[] = languagesIndexed
      ? criticalEntries(facts.criticalPaths, null, fileSet)
      : [];
    if (countsKnown && entries.length > 0) {
      const counts = await this.deps.intel.getImporterCounts(
        repoId,
        entries.map((e) => e.root),
      );
      entries = criticalEntries(facts.criticalPaths, counts, fileSet);
    }

    if (indexCause) return this.tour(facts, buildSkeleton(facts, entries), 0, indexCause, noCall());

    // 5. The one LLM call.
    const choice = await this.deps.repo.featureModel(workspaceId);
    const outcome = await this.callLlm(choice, target, facts);
    if ('cause' in outcome) {
      return this.tour(facts, buildSkeleton(facts, entries), 0, outcome.cause, outcome.meta);
    }
    const merged = mergeDraft(outcome.meta.result!.data, facts, entries);
    return this.tour(facts, merged.sections, merged.removed, null, outcome.meta);
  }

  private snapshot(state: TourIndexState): OnboardingIndexSnapshot {
    return {
      status: this.deps.indexEnabled ? state.status : 'off',
      reason: state.reason ?? null,
      files_indexed: state.filesIndexed,
      files_total: state.filesIndexed + (state.filesLeftOut ?? 0),
    };
  }

  private indexCause(snapshot: OnboardingIndexSnapshot): SkeletonCause | null {
    switch (snapshot.status) {
      case 'off':
        return { reason: 'index_off', detail: null };
      case 'degraded':
        return { reason: 'index_degraded', detail: null };
      case 'failed':
        return { reason: 'index_failed', detail: null };
      default:
        return null;
    }
  }

  private async collectFacts(input: {
    target: OnboardingTarget;
    commitSha: string;
    treePaths: string[];
    fileSet: ReadonlySet<string>;
    candidates: string[];
    languagesIndexed: boolean;
    snapshot: OnboardingIndexSnapshot;
    /** Routes, repo map and signatures only feed the LLM. */
    withLlmFacts: boolean;
  }): Promise<TourFacts> {
    const { target, commitSha, treePaths, fileSet, candidates, languagesIndexed } = input;
    const repoId = target.id;
    const show = (path: string) => this.deps.git.showFile(target, commitSha, path);

    // Files at the commit (git objects only; `.env*` is never read, EC-15).
    const composeFile = findComposeFile(treePaths);
    const readme = readmePath(treePaths);
    const pkgPaths = packageJsonPaths(treePaths);
    const [pkgTexts, composeText, readmeText] = await Promise.all([
      Promise.all(pkgPaths.map(async (p) => [p, await show(p)] as const)),
      composeFile ? show(composeFile) : Promise.resolve(null),
      readme ? show(readme) : Promise.resolve(null),
    ]);
    const scriptsByDir: ScriptsByDir = {};
    let rootPkg: string | null = null;
    for (const [path, text] of pkgTexts) {
      if (text === null) continue;
      const dir = path === PACKAGE_JSON ? '.' : path.slice(0, -(PACKAGE_JSON.length + 1));
      if (dir === '.') rootPkg = text;
      scriptsByDir[dir] = parseScripts(text);
    }

    // The indexed set (AC-45): `getFileRank` knows exactly the indexed candidates.
    const indexed = new Set<string>();
    for (let i = 0; i < candidates.length; i += FILE_RANK_CHUNK) {
      const rows = await this.deps.intel.getFileRank(repoId, candidates.slice(i, i + FILE_RANK_CHUNK));
      for (const r of rows) indexed.add(r.path);
    }

    const [pool, chains] = languagesIndexed
      ? await Promise.all([
          this.deps.intel.getTopFilesByRank(repoId, READING_PATH_POOL),
          this.deps.intel.getCriticalPaths(repoId),
        ])
      : [[] as string[], [] as string[][]];
    const ranked = pool.filter((p) => fileSet.has(p));

    let routes: string[] = [];
    let repoMap = '';
    let signatures: TourSignature[] = [];
    if (input.withLlmFacts && languagesIndexed) {
      const seeds = ranked.slice(0, ROUTE_SEED_FILES);
      const sigFiles = ranked.slice(0, SIGNATURE_FILES);
      const [blast, map, symbols] = await Promise.all([
        seeds.length ? this.deps.intel.getBlastRadius(repoId, seeds) : Promise.resolve(null),
        this.deps.intel.getRepoMap(repoId, REPO_MAP_TOKENS),
        sigFiles.length ? this.deps.intel.getSymbolsInFiles(repoId, sigFiles) : Promise.resolve([]),
      ]);
      routes = blast ? routesFromBlast(blast, ROUTES_MAX) : [];
      repoMap = map.text;
      const order = new Map(sigFiles.map((f, i) => [f, i]));
      signatures = symbols
        .filter((s): s is typeof s & { signature: string } => !!s.signature)
        .sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0))
        .map((s) => ({ file: s.file, name: s.name, kind: s.kind, signature: s.signature }));
    }

    return {
      stack: detectStack(rootPkg, treePaths),
      folders: topLevelFolders(treePaths, indexed),
      scriptsByDir,
      packageManager: detectPackageManager(treePaths),
      composeFile,
      composeServices: composeText ? composeServices(composeText) : [],
      hasEnvExample: hasEnvExample(treePaths),
      readme: readmeText ? capReadme(readmeText) : null,
      routes,
      repoMap,
      signatures,
      readingPath: languagesIndexed ? readingPath(ranked, fileSet) : [],
      criticalPaths: languagesIndexed ? chains : [],
      index: input.snapshot,
      commitSha,
      languagesIndexed,
      fileSet,
    };
  }

  /** At most one call; never a second one (AC-31, AC-87, AC-88). */
  private async callLlm(
    choice: FeatureModelChoice,
    target: OnboardingTarget,
    facts: TourFacts,
  ): Promise<{ meta: CallMeta } | { cause: SkeletonCause; meta: CallMeta }> {
    let llm;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        return { cause: { reason: 'no_llm_key', detail: errorMessage(err) }, meta: noCall() };
      }
      throw err;
    }

    const { messages, inputTokens } = buildTourMessages({
      system: await this.deps.systemPrompt(),
      repoName: target.fullName,
      facts,
      count: (text) => this.deps.countTokens(text),
    });
    if (inputTokens > MAX_INPUT_TOKENS) {
      return {
        cause: {
          reason: 'llm_error',
          detail: `The facts exceed the ${MAX_INPUT_TOKENS}-token input budget (${inputTokens} tokens) — no LLM call was made`,
        },
        meta: noCall(),
      };
    }

    const meta: CallMeta = { calls: 1, model: choice.model, result: null };
    const call = llm.completeStructured({
      model: choice.model,
      schema: TourDraft,
      schemaName: 'OnboardingTourDraft',
      messages,
      temperature: 0.2,
      maxTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      transportRetries: 0,
      reasoning: 'off',
      timeoutMs: LLM_TIMEOUT_MS + LLM_ADAPTER_GRACE_MS,
    });
    // withTimeout doesn't cancel: a late answer or failure is ignored (AC-21).
    call.catch(() => undefined);
    try {
      meta.result = await withTimeout(call, LLM_TIMEOUT_MS);
      meta.model = meta.result.model || choice.model;
      return { meta };
    } catch (err) {
      return { cause: { reason: classifyLlmError(err), detail: errorMessage(err) }, meta };
    }
  }

  private tour(
    facts: TourFacts,
    sections: TourSections,
    removed: number,
    cause: SkeletonCause | null,
    meta: CallMeta,
  ): OnboardingTour {
    const res = cause ? null : meta.result;
    return {
      kind: cause ? 'skeleton' : 'llm',
      skeleton_reason: cause?.reason ?? null,
      reason_detail: cause?.detail ? cause.detail.slice(0, DETAIL_MAX_CHARS) : null,
      languages_indexed: facts.languagesIndexed,
      index: facts.index,
      commit_sha: facts.commitSha,
      generated_at: this.now().toISOString(),
      model: meta.model,
      tokens_in: res?.tokensIn ?? null,
      tokens_out: res?.tokensOut ?? null,
      cost_usd: res?.costUsd ?? null,
      llm_calls: meta.calls,
      removed_ungrounded: removed,
      sections,
    };
  }
}

function noCall(): CallMeta {
  return { calls: 0, model: null, result: null };
}

/** Root `package.json` first, then nested ones (shallowest first, excluded dirs skipped). */
function packageJsonPaths(treePaths: readonly string[]): string[] {
  const excluded = new Set<string>(EXCLUDED_DIRS);
  const nested = treePaths
    .filter(
      (p) =>
        p.endsWith(`/${PACKAGE_JSON}`) &&
        !p.split('/').slice(0, -1).some((s) => excluded.has(s)),
    )
    .sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, NESTED_PACKAGE_JSON_MAX);
  return treePaths.includes(PACKAGE_JSON) ? [PACKAGE_JSON, ...nested] : nested;
}

/**
 * Maps an LLM failure to a skeleton reason (A3): timeouts first (our race, the
 * OpenRouter call budget, the SDKs' connection timeout), then a schema miss, else
 * a generic LLM error. Relies on the adapters' error text.
 */
export function classifyLlmError(err: unknown): OnboardingSkeletonReason {
  const e = err as { name?: unknown; message?: unknown; constructor?: { name?: unknown } } | null;
  const message = typeof e?.message === 'string' ? e.message : String(err);
  const name = typeof e?.name === 'string' ? e.name : '';
  const ctor = typeof e?.constructor?.name === 'string' ? e.constructor.name : '';
  if (
    /timed out|timeout/i.test(message) ||
    name === 'TimeoutError' ||
    name === 'APIConnectionTimeoutError' ||
    ctor === 'APIConnectionTimeoutError'
  ) {
    return 'llm_timeout';
  }
  if (/schema validation/i.test(message)) return 'invalid_output';
  return 'llm_error';
}

/** An error as stored and shown — never with a provider's key echo in it (AC-49). */
function errorMessage(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}
