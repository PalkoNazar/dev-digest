import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** One conventions extraction run over a repo (L02 homework — Conventions Extractor). */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
    error: text('error'),
    samplePaths: jsonb('sample_paths').$type<string[]>().notNull().default([]),
    tooling: jsonb('tooling').$type<string[]>().notNull().default([]),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    proposed: integer('proposed').notNull().default(0),
    kept: integer('kept').notNull().default(0),
    dropped: jsonb('dropped').$type<Record<string, number>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({ repoIdx: index('convention_scans_ws_repo_idx').on(t.workspaceId, t.repoId) }),
);

export interface ConventionEvidenceRow {
  path: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category').notNull().default('other'),
    rule: text('rule').notNull(),
    evidence: jsonb('evidence').$type<ConventionEvidenceRow[]>().notNull().default([]),
    confidence: doublePrecision('confidence'),
    adherence: doublePrecision('adherence'),
    supportFiles: integer('support_files'),
    violationFiles: integer('violation_files'),
    enforcedBy: text('enforced_by'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    edited: boolean('edited').notNull().default(false),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ repoIdx: index('conventions_ws_repo_idx').on(t.workspaceId, t.repoId) }),
);
