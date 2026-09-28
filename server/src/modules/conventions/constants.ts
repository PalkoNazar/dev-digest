/** Conventions Extractor (L02 homework) — tunables. Spec: specs/L02-conventions-extractor.md */

export const EXTRACT_JOB_KIND = 'conventions-extract';
/** One LLM call over ~15 files; generous, and never retried (it is paid). */
export const EXTRACT_JOB_TIMEOUT_MS = 300_000;
/** A `running` scan older than this is treated as interrupted (server restart, timeout). */
export const STALE_SCAN_MS = 15 * 60_000;

export const SYSTEM_PROMPT_TEMPLATE = 'conventions.system.md';

// ---- sampling (code only, no model) ----
/** Top-ranked files the stratified sample is drawn from. */
export const RANKED_POOL = 60;
export const SOURCE_SAMPLE_COUNT = 12;
export const TEST_SAMPLE_COUNT = 2;
export const SAMPLE_MAX_LINES = 250;
export const SAMPLE_MAX_LINE_CHARS = 240;
export const CONFIG_MAX_CHARS = 4000;
/** Top-level folders (by ranked files) whose tooling configs are also read. */
export const CONFIG_DIR_COUNT = 5;
/** Tooling configs looked up in the repo root and each top-level folder. */
export const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'prettier.config.mjs',
  '.editorconfig',
  'biome.json',
  'biome.jsonc',
] as const;

// ---- verification ----
export const MAX_CANDIDATES = 20;
export const MAX_EVIDENCE_PER_CANDIDATE = 4;
/** Longest evidence range (lines) we accept as one citation. */
export const MAX_EVIDENCE_SPAN = 40;
/** A snippet must hold at least one line this long — `}` alone proves nothing. */
export const MIN_SNIPPET_LINE_CHARS = 8;

// ---- adherence + confidence ----
export const MAX_PATTERN_LENGTH = 200;
export const GREP_CONCURRENCY = 4;
/** Below this share of conforming files the rule is not a convention of this repo. */
export const MIN_ADHERENCE = 0.6;
/** …but only judge adherence once this many files match either pattern. */
export const MIN_FILES_TO_JUDGE = 3;
/** Matching files at which measured confidence stops being discounted. */
export const FULL_SUPPORT_FILES = 5;
/** Evidence from a single file can't reach "high" confidence. */
export const SINGLE_FILE_CONFIDENCE_CAP = 0.69;
/** Detector without a counter-pattern: we saw usage, not the absence of violations. */
export const PATTERN_ONLY_CONFIDENCE_CAP = 0.6;
/** No usable detector: fall back to the model's guess, capped low. */
export const NO_DETECTOR_CONFIDENCE_CAP = 0.5;

/** Extensions counted when measuring adherence (docs, lockfiles, JSON are ignored). */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.vue',
  '.svelte',
] as const;

/** Accepted/rejected rules listed in the prompt as "already decided". */
export const KNOWN_RULES_IN_PROMPT = 40;
