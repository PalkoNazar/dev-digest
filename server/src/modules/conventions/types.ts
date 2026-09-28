import { z } from 'zod';
import { ConventionCategory, type ConventionEvidence } from '@devdigest/shared';

/**
 * Module-internal shapes of the Conventions Extractor. The HTTP contracts live in
 * `@devdigest/shared` (ConventionCandidate, ConventionScan, …).
 */

// ---- LLM output (validated by the provider's structured-output path) ----
// Nullable instead of optional: OpenAI strict json_schema requires every key.
export const ExtractedEvidence = z.object({
  path: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string(),
});

export const ExtractedDetector = z.object({
  /** Regex (ripgrep syntax) for a line that FOLLOWS the rule. */
  pattern: z.string(),
  /** Regex for a line that BREAKS the rule; null when there is no line-level signature. */
  counter_pattern: z.string().nullable(),
  /** Limit measurement to paths starting with this prefix (e.g. "server/src/"). */
  path_prefix: z.string().nullable(),
});
export type ExtractedDetector = z.infer<typeof ExtractedDetector>;

export const ExtractedConvention = z.object({
  category: ConventionCategory,
  rule: z.string(),
  evidence: z.array(ExtractedEvidence),
  detector: ExtractedDetector.nullable(),
  confidence: z.number(),
});
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedConvention),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

// ---- job payload (parsed at the job boundary) ----
export const ExtractJobPayload = z.object({
  workspaceId: z.string().uuid(),
  repoId: z.string().uuid(),
  scanId: z.string().uuid(),
});
export type ExtractJobPayload = z.infer<typeof ExtractJobPayload>;

// ---- pipeline ----
export type SampleKind = 'source' | 'test' | 'config';

export interface SampleFile {
  path: string;
  kind: SampleKind;
  content: string;
}

/** Something a tooling config already enforces, with words that identify it in a rule. */
export interface ToolingFact {
  tool: 'typescript' | 'prettier' | 'eslint' | 'biome' | 'editorconfig';
  /** The config file it came from. */
  source: string;
  /** Short name shown to the model ("quotes", "no-console", "strict type checking"). */
  topic: string;
  /** Lower-case phrases; a rule containing one of them is about this fact. */
  keywords: string[];
}

/** How the repo follows a rule, measured with its detector over the whole clone. */
export interface Adherence {
  /** conforming / (conforming + violating); null when there is no counter-pattern. */
  adherence: number | null;
  /** Files matching the pattern and not the counter-pattern. */
  support: number;
  /** Files matching the counter-pattern; null when there is none. */
  violations: number | null;
}

/** A verified candidate, ready to store. */
export interface NewConvention {
  category: ConventionCategory;
  rule: string;
  evidence: ConventionEvidence[];
  confidence: number;
  adherence: number | null;
  supportFiles: number | null;
  violationFiles: number | null;
  enforcedBy: string | null;
}

/** Why a proposed candidate was not kept (counts land in `convention_scans.dropped`). */
export type DropReason =
  | 'empty_rule'
  | 'unverified_evidence'
  | 'duplicate'
  | 'already_decided'
  | 'low_adherence';

export interface ScanResult {
  samplePaths: string[];
  tooling: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  proposed: number;
  kept: number;
  dropped: Partial<Record<DropReason, number>>;
}
