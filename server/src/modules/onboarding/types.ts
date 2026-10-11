import { z } from 'zod';
import type { OnboardingIndexSnapshot } from '@devdigest/shared';

/**
 * Module-internal shapes of the Onboarding Tour. The HTTP contracts live in
 * `@devdigest/shared` (OnboardingTour, OnboardingView, …).
 */

// ---- LLM output (validated by the provider's structured-output path) ----
// Every key is required, `nullable` instead of optional: strict json_schema needs it.
export const TourDraft = z.object({
  architecture: z.object({
    body_md: z.string().max(6000),
    diagram: z.string().max(4000).nullable(),
  }),
  critical_paths: z.object({
    body_md: z.string().max(2000).nullable(),
    descriptions: z
      .array(z.object({ root: z.string(), description: z.string().max(200) }))
      .max(5),
  }),
  run_locally: z.object({
    body_md: z.string().max(2000).nullable(),
    steps: z.array(z.object({ command: z.string().max(300) })).max(10),
  }),
  reading_path: z.object({
    body_md: z.string().max(2000).nullable(),
    reasons: z.array(z.object({ path: z.string(), reason: z.string().max(200) })).max(10),
  }),
  first_tasks: z.object({
    body_md: z.string().max(4000),
  }),
});
export type TourDraft = z.infer<typeof TourDraft>;

// ---- job payload (parsed at the job boundary) ----
export const GenerateJobPayload = z.object({
  workspaceId: z.string().uuid(),
  repoId: z.string().uuid(),
  generationId: z.string().uuid(),
});
export type GenerateJobPayload = z.infer<typeof GenerateJobPayload>;

// ---- facts ----
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

/** A symbol signature of a top-ranked file (rows come in rank order, highest first). */
export interface TourSignature {
  file: string;
  name: string;
  kind: string;
  signature: string;
}

/** `package.json` scripts keyed by the directory of the file; the root is `'.'`. */
export type ScriptsByDir = Record<string, Record<string, string>>;

/** Everything collected deterministically for one generation, before any LLM call. */
export interface TourFacts {
  stack: string[];
  /** Top-level folders with their indexed-file counts (AC-45). */
  folders: { path: string; files: number }[];
  scriptsByDir: ScriptsByDir;
  /** null = no root `package.json`. */
  packageManager: PackageManager | null;
  composeFile: string | null;
  composeServices: string[];
  hasEnvExample: boolean;
  /** Root README text (already capped), null when there is none. */
  readme: string | null;
  /** "METHOD /path", highest-ranked first (≤ ROUTES_MAX). */
  routes: string[];
  repoMap: string;
  signatures: TourSignature[];
  /** The S7 reading path, in rank order (≤ READING_PATH_MAX). */
  readingPath: string[];
  /** Raw facade chains (root first). */
  criticalPaths: string[][];
  index: OnboardingIndexSnapshot;
  commitSha: string;
  languagesIndexed: boolean;
  /** Every file path of the tree at the tour's commit. */
  fileSet: ReadonlySet<string>;
}
