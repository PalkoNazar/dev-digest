import type {
  CodeMatch,
  ConventionCandidate,
  ConventionScan,
  ConventionUpdate,
  FeatureModelChoice,
  LLMProvider,
  Provider,
  RepoRef,
} from '@devdigest/shared';
import type { KnownRule } from './pipeline/prompt.js';
import type { NewConvention, ScanResult } from './types.js';

/** What the conventions use cases need, in domain terms. */

export interface ConventionTarget extends RepoRef {
  id: string;
  fullName: string;
}

export interface ConventionsRepo {
  /** The workspace's repo, or null. */
  findRepo(workspaceId: string, repoId: string): Promise<ConventionTarget | null>;
  /** Provider+model the feature runs on (Settings → Feature Models, else default). */
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
  latestScan(workspaceId: string, repoId: string): Promise<ConventionScan | null>;
  createScan(workspaceId: string, repoId: string): Promise<ConventionScan>;
  /**
   * Atomically: finish a still-`running` scan and replace the repo's pending candidates
   * with `candidates`. Returns false (and writes nothing) if the scan is no longer
   * running — e.g. it was marked failed after a job timeout.
   */
  completeScan(
    workspaceId: string,
    scanId: string,
    result: ScanResult,
    candidates: NewConvention[],
  ): Promise<boolean>;
  failScan(workspaceId: string, scanId: string, error: string): Promise<void>;
  list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /** Accepted/rejected rules of the repo, most recently decided first. */
  knownRules(workspaceId: string, repoId: string): Promise<KnownRule[]>;
  update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdate & { edited?: boolean },
  ): Promise<ConventionCandidate | null>;
  get(workspaceId: string, id: string): Promise<ConventionCandidate | null>;
}

export interface JobQueue {
  enqueue(
    workspaceId: string,
    kind: string,
    payload: unknown,
  ): Promise<{ id: string; done: Promise<void> }>;
}

export interface ConventionsDeps {
  repo: ConventionsRepo;
  jobs: JobQueue;
  /** File text from the repo clone; null when missing/unreadable. */
  readFile(repo: RepoRef, path: string): Promise<string | null>;
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  /** Ranked source files (tests/configs excluded) and ranked test files. */
  rankedFiles(repoId: string, n: number): Promise<string[]>;
  testFiles(repoId: string, n: number): Promise<string[]>;
  llm(provider: Provider): Promise<LLMProvider>;
  systemPrompt(): Promise<string>;
  now?: () => Date;
}
