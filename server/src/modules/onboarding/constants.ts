/**
 * Onboarding Tour (L05) tunables. Spec: specs/L05-onboarding-tour.md
 * Plan: specs/plans/2026-10-11-l05-onboarding-tour.plan.md (S6).
 */

// ---- job ----
export const GENERATE_JOB_KIND = 'onboarding-generate';
/** Facts + one LLM call; generous, and never retried (the call is paid). */
export const GENERATE_JOB_TIMEOUT_MS = 300_000;
/** A `running` generation older than this is reported as interrupted (AC-18). */
export const STALE_GENERATION_MS = 15 * 60_000;

// ---- the one LLM call (AC-20, AC-87) ----
/** The service's own race timer for the LLM call (AC-20). */
export const LLM_TIMEOUT_MS = 120_000;
/** The adapter's abort fires this long after our timer, so ours always wins. */
export const LLM_ADAPTER_GRACE_MS = 5_000;
/** System + user tokens of the one call (AC-33). */
export const MAX_INPUT_TOKENS = 12_000;
export const MAX_OUTPUT_TOKENS = 4_000;
/** README characters sent to the model (AC-85). */
export const README_MAX_CHARS = 4_000;

// ---- facts ----
export const READING_PATH_MAX = 10;
/** Ranked files fetched before the stricter reading-path filter (AC-26). */
export const READING_PATH_POOL = 50;
export const CRITICAL_PATHS_MAX = 5;
export const ROUTES_MAX = 50;
/** Top-ranked files whose blast radius yields the routes fact (Q8). */
export const ROUTE_SEED_FILES = 30;
export const SIGNATURE_FILES = 30;
export const REPO_MAP_TOKENS = 1_500;
/** `getFileRank` input chunk size (an `inArray` per chunk). */
export const FILE_RANK_CHUNK = 1_000;

export const SYSTEM_PROMPT_TEMPLATE = 'onboarding.system.md';
export const FEATURE_ID = 'onboarding';

// ---- "indexing in progress" (AC-52, Q6) ----
/**
 * Job kinds that clone or index a repo. Copies of `repos/service.ts` `CLONE_JOB_KIND`
 * and `repo-intel/constants.ts` `*_JOB_KIND` — modules don't import each other.
 */
export const INDEXING_JOB_KINDS = [
  'clone',
  'repo-intel-index',
  'repo-intel-refresh',
  'repo-intel-resync',
] as const;
/** A queued/running indexing job scheduled longer ago than this is ignored. */
export const INDEXING_FRESH_MS = 15 * 60_000;

// ---- copies of repo-intel scope (modules don't import each other) ----
/** Copy of `repo-intel/constants.ts` `SUPPORTED_EXT`: the languages the index parses. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;
/** Copy of `repo-intel/constants.ts` `EXCLUDED_DIRS`: directories never walked. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

// ---- reading path (AC-26) ----
/** Path segments (directories) that keep a file out of the reading path. */
export const READING_PATH_EXCLUDE_SEGMENTS = [
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'migrations',
  'generated',
  '__generated__',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
  'vendor',
] as const;
/** File-name fragments that keep a file out of the reading path. */
export const READING_PATH_EXCLUDE_PATTERNS = [
  '.d.ts',
  '.test.',
  '.spec.',
  '.gen.',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

// ---- run steps (AC-62, AC-81, AC-83) ----
/** Programs a run step may start with, besides `docker compose` and the package manager. */
export const BASE_PROGRAMS = ['node', 'npx', 'make', 'cp'] as const;
/** Root lockfile → package manager, in lookup order. */
export const LOCKFILES = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
} as const;
export const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
export const ENV_EXAMPLE_FILE = '.env.example';
/** Root Makefile names `make` reads. */
export const MAKEFILES = ['Makefile', 'makefile', 'GNUmakefile'] as const;
