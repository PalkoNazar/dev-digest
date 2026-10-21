import type {
  BlastRadius,
  FeatureModelChoice,
  GitHubClient,
  LLMProvider,
  PrBrief,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import type { BriefSnapshot, StoredBrief } from './types.js';

/**
 * Ports of the PR Brief module (SPEC-03). Every method is scoped by `workspaceId`.
 */
export interface BriefRepo {
  /** The PR's current head + its stored brief (null when none or unreadable); null = PR not in ws. */
  readBrief(workspaceId: string, prId: string): Promise<{ headSha: string; brief: PrBrief | null } | null>;
  /** PR row (+ repo) and its `pr_files`, read in one repeatable-read transaction; null = PR not in ws. */
  snapshot(workspaceId: string, prId: string): Promise<BriefSnapshot | null>;
  /**
   * Validate (`PrBrief`), upsert and return the stored brief + the PR's current head,
   * in one transaction. Invalid → throws `invalid_brief` before any write; null = PR not in ws.
   */
  saveBrief(workspaceId: string, prId: string, brief: PrBrief): Promise<StoredBrief | null>;
  /** Settings → Feature Models → Risk Brief, else the registry default (AC-43). */
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
}

/**
 * The stored intent of a PR (structural subset of `container.reviewRepo`; this module
 * never imports `reviews/*`). null = none derived.
 */
export interface BriefIntentSource {
  getIntentRecord(workspaceId: string, prId: string): Promise<{ record: PrIntentRecord } | null>;
}

/** The PR's blast radius map (structural subset of `container.blast`). */
export interface BriefBlastSource {
  forPull(workspaceId: string, prId: string): Promise<BlastRadius>;
}

/** Repo-wide attached Project Context docs (structural subset of `container.projectContext`). */
export interface BriefDocSource {
  repoDocs(
    workspaceId: string,
    repoId: string,
  ): Promise<{ attached: string[]; docs: { path: string; text: string }[]; skipped: string[]; clone: boolean }>;
}

/** The slice of a pino logger the service uses: ids, counts, model, usage — never PR/model text. */
export interface BriefLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface BriefDeps {
  repo: BriefRepo;
  intent: BriefIntentSource;
  blast: BriefBlastSource;
  docs: BriefDocSource;
  /** Throws `ConfigError` when no GitHub token is configured. */
  github(): Promise<Pick<GitHubClient, 'getIssue' | 'linkedIssueNumbers'>>;
  /** Throws `ConfigError` when the provider has no key (AC-67). */
  llm(provider: Provider): Promise<LLMProvider>;
  /** The rendered `brief.system.md` (`INJECTION_GUARD` is appended by the prompt builder). */
  systemPrompt(): Promise<string>;
  log: BriefLogger;
  now?: () => Date;
  /** Our race on the model call; defaults to `LLM_TIMEOUT_MS` (tests shorten it). */
  timeoutMs?: number;
}
