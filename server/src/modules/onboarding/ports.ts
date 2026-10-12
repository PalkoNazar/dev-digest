import type {
  FeatureModelChoice,
  GitTreeEntry,
  LLMProvider,
  OnboardingGeneration,
  OnboardingTour,
  Provider,
  RepoRef,
} from '@devdigest/shared';

/**
 * What the Onboarding Tour use cases need, in domain terms (plan S10). The
 * repo-intel and git ports are structural subsets of `container.repoIntel` /
 * `container.git` — this module never imports `repo-intel/*` (the `blast/ports.ts`
 * `BlastSource` precedent); the composition root (`routes.ts`) plugs them in.
 */

export interface OnboardingTarget extends RepoRef {
  id: string;
  fullName: string;
  /** null until the repo is cloned (AC-51). */
  clonePath: string | null;
}

/** What `completeGeneration` did with the tour. */
export type CompleteOutcome = 'stored' | 'kept_previous' | 'discarded';

/** Storage of tours and generations. Every method is scoped by `workspaceId`. */
export interface OnboardingRepo {
  findRepo(workspaceId: string, repoId: string): Promise<OnboardingTarget | null>;
  /** Provider+model of the `onboarding` feature (Settings → Feature Models, else default). */
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
  /** The most recently started generation of the repo, as stored (no stale mapping). */
  latestGeneration(workspaceId: string, repoId: string): Promise<OnboardingGeneration | null>;
  /** A new `running` generation; a second running one → `ConflictError` (AC-14). */
  createGeneration(workspaceId: string, repoId: string): Promise<OnboardingGeneration>;
  /** Marks a still-`running` generation `failed` with `detail`; no-op otherwise. */
  failGeneration(workspaceId: string, generationId: string, detail: string): Promise<void>;
  /**
   * In one transaction, only while the generation is still `running` (AC-21/23):
   * a skeleton never replaces a stored LLM tour (`kept_previous`, AC-77), anything
   * else is stored (`stored`, AC-16). Not running any more → `discarded`, no write.
   */
  completeGeneration(
    workspaceId: string,
    generationId: string,
    tour: OnboardingTour,
  ): Promise<CompleteOutcome>;
  /** The stored tour; legacy or invalid JSON → null. */
  getTour(workspaceId: string, repoId: string): Promise<OnboardingTour | null>;
  /** A queued/running clone or index job of the repo scheduled within 15 min (AC-52, A5). */
  indexingInProgress(workspaceId: string, repoId: string): Promise<boolean>;
}

/** Index state, as the repo-intel facade reports it. */
export interface TourIndexState {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  filesLeftOut?: number;
  /** '' when the repo was never indexed. */
  lastIndexedSha: string;
  reason?: string;
}

/** The slice of a blast-radius result the routes fact reads (Q8). */
export interface TourBlastResult {
  callers: Array<{ file: string; rank: number }>;
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
}

/** Structural subset of the repo-intel facade (`container.repoIntel`). */
export interface TourFactsSource {
  getIndexState(repoId: string): Promise<TourIndexState>;
  getTopFilesByRank(repoId: string, n: number, opts?: { exclude?: string[] }): Promise<string[]>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
  getFileRank(repoId: string, paths: string[]): Promise<Array<{ path: string }>>;
  getBlastRadius(repoId: string, files: string[]): Promise<TourBlastResult>;
  getRepoMap(repoId: string, tokenBudget?: number): Promise<{ text: string }>;
  getSymbolsInFiles(
    repoId: string,
    paths: string[],
  ): Promise<Array<{ file: string; name: string; kind: string; signature: string | null }>>;
  getImporterCounts(repoId: string, paths: string[]): Promise<Record<string, number>>;
}

/** Git objects of the clone (never the working tree, EC-15). */
export interface TreeSource {
  listTree(repo: RepoRef, ref: string): Promise<GitTreeEntry[] | null>;
  showFile(repo: RepoRef, ref: string, path: string): Promise<string | null>;
  currentHead(repo: RepoRef): Promise<string>;
}

export interface JobQueue {
  enqueue(
    workspaceId: string,
    kind: string,
    payload: unknown,
  ): Promise<{ id: string; done: Promise<void> }>;
}

/** The slice of a pino logger the service uses: ids, counts, model, cost — never repo content or prompt text. */
export interface TourLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
  debug(obj: object, msg: string): void;
}

export interface OnboardingDeps {
  repo: OnboardingRepo;
  intel: TourFactsSource;
  git: TreeSource;
  jobs: JobQueue;
  /** Throws `ConfigError` when the provider has no key (AC-41). */
  llm(provider: Provider): Promise<LLMProvider>;
  /** The rendered onboarding system prompt (async: `renderPrompt`, A6). */
  systemPrompt(): Promise<string>;
  countTokens(text: string): number;
  /** `config.repoIntelEnabled` — off → skeleton `index_off` (AC-75). */
  indexEnabled: boolean;
  log: TourLogger;
  now?: () => Date;
}
