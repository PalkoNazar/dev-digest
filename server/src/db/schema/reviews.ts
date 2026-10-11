import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import type {
  FindingScope,
  IntentConfidence,
  IntentMode,
  IntentPromptComponent,
  IntentSource,
  UnresolvedRef,
} from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    /** 'in' | 'out' of the PR's derived intent scope; null = untagged / pre-intent row. */
    scope: text('scope').$type<FindingScope>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    // Findings of given reviews: PR-list FINDINGS (pulls/routes.ts), reviewsForPull,
    // and the ON DELETE CASCADE from reviews — FKs get no index automatically.
    reviewIdx: index('findings_review_id_idx').on(t.reviewId),
  }),
);

/**
 * Derived PR intent (one row per PR). Workspace scope comes from the parent
 * `pull_requests.workspace_id`. `intent` holds the contract's `summary` (column
 * kept under its old name so the migration only adds columns).
 */
export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  confidence: text('confidence').$type<IntentConfidence>().notNull().default('low'),
  mode: text('mode').$type<IntentMode>().notNull().default('fallback'),
  missingContext: boolean('missing_context').notNull().default(true),
  contextGaps: jsonb('context_gaps').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sourcesUsed: jsonb('sources_used').$type<IntentSource[]>().notNull().default(sql`'[]'::jsonb`),
  unresolvedRefs: jsonb('unresolved_refs')
    .$type<UnresolvedRef[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Per-component prompt sizes (chars / est tokens) — never the prompt text. */
  promptComponents: jsonb('prompt_components')
    .$type<IntentPromptComponent[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  headSha: text('head_sha'),
  /** sha256 of title/body/branch/head_sha/prompt version — the cache key. */
  inputHash: text('input_hash'),
  provider: text('provider'),
  model: text('model'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: doublePrecision('cost_usd'),
  /** Why the classifier was skipped/failed; redacted, at most 500 chars. */
  fallbackReason: text('fallback_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
