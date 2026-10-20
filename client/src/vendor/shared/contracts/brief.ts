import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** Evidence-based confidence of a derived intent (not the model's self-report). */
export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** `llm` = classifier output; `fallback` = derived from title/branch/paths only. */
export const IntentMode = z.enum(['llm', 'fallback']);
export type IntentMode = z.infer<typeof IntentMode>;

export const IntentSourceKind = z.enum([
  'title',
  'body',
  'linked_issue',
  'mentioned_issue',
  'spec_doc',
  'branch',
  'file_hunks',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** A source that was actually fed to the intent classifier. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  title: z.string().nullish(),
  truncated: z.boolean().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const UnresolvedRefReason = z.enum([
  'not_found',
  'too_large',
  'invalid_path',
  'external_repo',
  'no_credentials',
  'no_github_token',
  'fetch_failed',
  'limit_reached',
]);
export type UnresolvedRefReason = z.infer<typeof UnresolvedRefReason>;

/** A referenced issue/doc/tracker link that could not be read (never invented). */
export const UnresolvedRef = z.object({
  kind: z.enum(['issue', 'doc', 'external']),
  ref: z.string(),
  reason: UnresolvedRefReason,
});
export type UnresolvedRef = z.infer<typeof UnresolvedRef>;

/** Size of one classifier prompt component (sizes only — never the text). */
export const IntentPromptComponent = z.object({
  component: z.enum(['title', 'body', 'issue', 'doc', 'branch', 'files']),
  ref: z.string().nullish(),
  chars: z.number().int(),
  est_tokens: z.number().int(),
  truncated: z.boolean().nullish(),
});
export type IntentPromptComponent = z.infer<typeof IntentPromptComponent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  /** File declaring this changed symbol — tells same-named symbols in different files apart. */
  file: z.string().optional(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

/** Why a blast map is incomplete (mirrors repo-intel's DegradedReason). */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** Summary counts: changed symbols, callers, distinct endpoints and crons. */
export const BlastStats = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
});
export type BlastStats = z.infer<typeof BlastStats>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** True when the repo-intel index is missing, partial or failed. */
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
  stats: BlastStats.optional(),
  /** Commit the index was built at — caller lines refer to this SHA. */
  index_sha: z.string().nullish(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief (L05, SPEC-03) ----
/** One "read these first" item. `line` is null when no changed/caller line applies. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().positive().nullable(),
  reason: z.string(),
  /** True when `line` lies outside the PR's changed line ranges. */
  outside_changed_lines: z.boolean(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/** A fact the brief generation reads; used to explain missing or cut inputs. */
export const BriefInput = z.enum([
  'intent',
  'blast',
  'linked_issues',
  'spec_docs',
  'pr_description',
  'changed_files',
  'blast_callers',
]);
export type BriefInput = z.infer<typeof BriefInput>;

/** Why an input is missing, partial or cut (a code — the client renders the text). */
export const BriefInputReason = z.enum([
  'not_derived',
  'older_commit',
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'unavailable',
  'none_linked',
  'no_github_token',
  'not_found',
  'fetch_failed',
  'limit_reached',
  'none_attached',
  'no_clone',
  'unreadable',
  'empty',
  'truncated',
  'omitted_budget',
]);
export type BriefInputReason = z.infer<typeof BriefInputReason>;

export const BriefInputNote = z.object({
  input: BriefInput,
  reason: BriefInputReason,
  /** Issue number, doc path, … the note is about (absent for whole-input notes). */
  ref: z.string().nullish(),
});
export type BriefInputNote = z.infer<typeof BriefInputNote>;

/** How many model-proposed items grounding removed (invented paths/lines). */
export const BriefRemoved = z.object({
  risks: z.number().int().nonnegative(),
  file_refs: z.number().int().nonnegative(),
  review_focus: z.number().int().nonnegative(),
});
export type BriefRemoved = z.infer<typeof BriefRemoved>;

/** Generation metadata. `head_sha` = the commit of the files the brief was built from. */
export const BriefRun = z.object({
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nonnegative(),
  est_input_tokens: z.number().int().nonnegative(),
  head_sha: z.string(),
  generated_at: z.string(),
});
export type BriefRun = z.infer<typeof BriefRun>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  summary: z.string(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  /** Snapshot of the stored intent used as input; null when none was derived. */
  intent: Intent.nullable(),
  /** Snapshot of the blast map used as input; null when unavailable. */
  blast: BlastRadius.nullable(),
  /** Prior PRs — not produced in L05 (Non-goal); kept optional for later lessons. */
  history: PrHistory.nullish(),
  inputs: z.array(BriefInputNote),
  removed: BriefRemoved,
  run: BriefRun,
});
export type PrBrief = z.infer<typeof PrBrief>;

/** GET/POST /pulls/:id/brief. `stale` = the PR head moved since `brief.run.head_sha`. */
export const PrBriefResponse = z.object({
  brief: PrBrief.nullable(),
  stale: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
