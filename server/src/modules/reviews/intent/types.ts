/**
 * Module-internal types of the intent layer (no I/O, no Drizzle). The
 * repository returns these shapes; rows never leave it.
 */
import { z } from 'zod';
import type { IntentSourceKind, PrIntentRecord, RepoRef } from '@devdigest/shared';

/** The PR fields the intent classifier reads, plus its repo (null if the repo row is gone). */
export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  base: string;
  headSha: string;
  repo: RepoRef | null;
}

/** A stored intent plus its cache key (`input_hash` is not part of the API contract). */
export interface StoredIntent {
  record: PrIntentRecord;
  inputHash: string | null;
}

/** What the service writes; `pr_id` and `updated_at` are set by the repository. */
export type IntentRecordWrite = Omit<PrIntentRecord, 'pr_id' | 'updated_at'> & {
  input_hash: string | null;
};

// ---- classifier output (validated by the provider's structured-output path) ----
// No bounds here: `clampIntent` enforces lengths so a long answer is trimmed, not rejected.
export const IntentExtraction = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  /** Missing / unreadable task context the model had to work around. */
  context_gaps: z.array(z.string()),
  /** How well the sources support the intent; can only LOWER the evidence-based confidence. */
  evidence_strength: z.enum(['weak', 'moderate', 'strong']),
});
export type IntentExtraction = z.infer<typeof IntentExtraction>;

/**
 * One changed file as the classifier sees it: path, line counts and hunk headers
 * (`@@ -a,b +c,d @@ <section>`). Never any line of the change body.
 */
export interface FileSummary {
  path: string;
  additions: number;
  deletions: number;
  hunks: string[];
}

/** An issue of the PR's own repo to fetch (`ref` is display text such as `#12`). */
export interface IssueRef {
  number: number;
  ref: string;
  kind: Extract<IntentSourceKind, 'linked_issue' | 'mentioned_issue'>;
}

/** A plan/spec doc of the PR's own repo, read at the head SHA. */
export interface DocRef {
  /** Repo-relative path (leading `./` removed). */
  path: string;
}

/** A source text as it goes into the prompt, after the per-source and total caps. */
export interface ContextText {
  text: string;
  truncated: boolean;
}

export interface FetchedIssue extends ContextText {
  ref: string;
  title: string;
  kind: IssueRef['kind'];
}

export interface FetchedDoc extends ContextText {
  path: string;
}

/** What `derive` returns to its caller (the executor adds it to logs and the trace). */
export interface IntentDerivation {
  record: PrIntentRecord;
  /** `cached` = stored llm record reused; the classifier was not called. */
  source: 'llm' | 'cached' | 'fallback';
  ms: number;
  /** Sum of the prompt components' token estimates. */
  estTokens: number;
}
