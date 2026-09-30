import type {
  FeatureModelChoice,
  GitClient,
  GitHubClient,
  LLMProvider,
  PrIntentRecord,
  Provider,
  RunEventKind,
} from '@devdigest/shared';
import type {
  FileSummary,
  IntentDerivation,
  IntentPull,
  IntentRecordWrite,
  StoredIntent,
} from './types.js';

/** What the intent use cases need, in domain terms (implemented by ReviewRepository). */
export interface IntentRepo {
  /** PR title/body/branch/head + repo, or null when the PR is not in the workspace. */
  getPullForIntent(workspaceId: string, prId: string): Promise<IntentPull | null>;
  getIntentRecord(workspaceId: string, prId: string): Promise<StoredIntent | null>;
  /** Upsert; null when the PR is not in the workspace. */
  saveIntentRecord(
    workspaceId: string,
    prId: string,
    rec: IntentRecordWrite,
  ): Promise<PrIntentRecord | null>;
  /** The "PR Review · Intent" model choice (Settings → Feature Models, else default). */
  intentFeatureModel(workspaceId: string): Promise<FeatureModelChoice>;
}

/** Live Log sink. `data` must never carry PR/issue/doc/diff text (it is mirrored to pino). */
export type IntentEventSink = (kind: RunEventKind, msg: string, data?: unknown) => void;

export interface DeriveOptions {
  /** Skip the cache (manual Recompute). */
  force?: boolean;
  /** Changed files + hunk headers; never the diff itself. */
  files?: FileSummary[];
  /**
   * Head SHA the `files` were summarized at. When the PR row has moved on since,
   * the result is saved without a cache key (never reused, shown as stale).
   */
  filesHeadSha?: string;
  onEvent?: IntentEventSink;
}

/** The narrow interface the review executor depends on. */
export interface IntentDeriver {
  derive(workspaceId: string, prId: string, opts?: DeriveOptions): Promise<IntentDerivation>;
}

export interface IntentDeps {
  repo: IntentRepo;
  /** Throws ConfigError when no GitHub token is configured. */
  github(): Promise<Pick<GitHubClient, 'getIssue' | 'linkedIssueNumbers' | 'getFileAtRef'>>;
  git: Pick<GitClient, 'showFile'>;
  /** Throws ConfigError when the provider key is missing. */
  llm(provider: Provider): Promise<LLMProvider>;
  systemPrompt(): Promise<string>;
  /** Files + hunk headers of the PR's current diff and the head SHA it was read at (manual recompute path). */
  loadDiffSummary(workspaceId: string, prId: string): Promise<{ files: FileSummary[]; headSha: string | null }>;
  /** Classifier timeout override (tests); default INTENT_TIMEOUT_MS. */
  timeoutMs?: number;
}
