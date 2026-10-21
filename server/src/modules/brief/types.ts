import { z } from 'zod';
import {
  RiskSeverity,
  type BlastRadius,
  type BriefRemoved,
  type IntentConfidence,
  type PrBrief,
  type ReviewFocusItem,
  type Risk,
  type RepoRef,
  type SmartDiffRole,
} from '@devdigest/shared';

/**
 * Module-internal shapes of the PR Brief (SPEC-03). The HTTP contracts live in
 * `@devdigest/shared` (`PrBrief`, `PrBriefResponse`).
 */

// ---- repository shapes (plan S5) ----
export interface BriefPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
  /** Head the stored `pr_files` were fetched at; null = never fetched. */
  detailHeadSha: string | null;
  repo: RepoRef | null;
}

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** PR row + its files, read in one transaction (one consistent state). */
export interface BriefSnapshot {
  pull: BriefPull;
  files: BriefFile[];
}

/** A stored brief + the PR's current head, from the same write. */
export interface StoredBrief {
  brief: PrBrief;
  headSha: string;
}

// ---- LLM output (plan S6, AC-48) ----
// No `.max()` bounds: over-long texts / too many items are cut after grounding
// (AC-95/96), not rejected. Every key required, `nullable` instead of optional
// (strict json_schema).
export const BriefDraft = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: RiskSeverity,
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().nullable(),
      reason: z.string(),
    }),
  ),
});
export type BriefDraft = z.infer<typeof BriefDraft>;

// ---- grounding (plan S6) ----
/** A new-side changed line range, inclusive. */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * What a brief may cite: the PR files with their changed ranges, and the blast
 * map files with their caller lines (null when blast is missing or degraded, AC-53).
 */
export interface GroundingSet {
  prFiles: Map<string, LineRange[]>;
  blastFiles: Map<string, number[]> | null;
}

/** A draft after grounding (and after caps): contract-shaped items + removal counts. */
export interface GroundedBrief {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  removed: BriefRemoved;
}

// ---- prompt facts (plan S7) ----
export interface BriefFileFact {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  ranges: LineRange[];
}

export interface BriefIntentFact {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: IntentConfidence;
}

export interface BriefIssueFact {
  number: number;
  title: string;
  body: string;
}

export interface BriefDocFact {
  path: string;
  text: string;
}

/** Everything the one model call sees. All but `system` is untrusted. */
export interface BriefFacts {
  /** Rendered `brief.system.md` (trusted); `INJECTION_GUARD` is appended in code. */
  system: string;
  title: string;
  /** PR description; '' = empty. */
  body: string;
  intent: BriefIntentFact | null;
  blast: BlastRadius | null;
  callerFiles: string[];
  /**
   * Caller lines per caller file, from the non-degraded blast map (the same map is
   * the `blastFiles` grounding set). A file with lines is shown as `path (lines a, b)`.
   */
  callerLines?: Map<string, number[]>;
  files: BriefFileFact[];
  issues: BriefIssueFact[];
  docs: BriefDocFact[];
}
