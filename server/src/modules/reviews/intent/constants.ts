/**
 * Intent layer — tunables. Spec: specs/2026-09-29-intent-layer.md
 */

/** Bumped whenever the classifier prompt changes, so cached intents are recomputed. */
export const INTENT_PROMPT_VERSION = 'intent-v3';

/** Trusted system prompt template under `src/prompts/`. */
export const INTENT_SYSTEM_PROMPT_TEMPLATE = 'intent.system.md';

// ---- sources (caps) ----
// MAX_ISSUES, MAX_DOCS, ISSUE_MAX_CHARS and the doc/tracker ref rules live in
// `modules/_shared/pr-refs-constants.ts` (shared with the PR Brief).
export const MAX_FILES = 100;
export const MAX_HUNK_HEADERS_PER_FILE = 5;
export const HUNK_HEADER_MAX_CHARS = 120;
export const BODY_MAX_CHARS = 4000;
export const DOC_MAX_CHARS = 6000;
/** Budget for body + issues + docs together (chars), filled in that order. */
export const TOTAL_CONTEXT_MAX_CHARS = 20_000;

// ---- classifier call ----
export const INTENT_TIMEOUT_MS = 60_000;
export const INTENT_MAX_TOKENS = 600;

// ---- output clamp ----
/** Asked of the model in the system prompt (the clamp enforces chars, not words). */
export const SUMMARY_MAX_WORDS = 25;
export const SUMMARY_MAX_CHARS = 240;
export const SCOPE_MAX_ITEMS = 6;
export const GAPS_MAX_ITEMS = 3;
export const ITEM_MAX_CHARS = 120;
/** Stored `fallback_reason` (redacted) is cut to this length. */
export const FALLBACK_REASON_MAX_CHARS = 500;
/** Fallback in-scope list: at most this many top-level areas of the changed paths. */
export const FALLBACK_MAX_AREAS = 5;

// ---- confidence ----
/** A resolved issue/doc needs at least this much text to back a `high` intent. */
export const STRONG_SOURCE_MIN_CHARS = 80;
/** A body is "descriptive" from this many chars (after stripping HTML comments). */
export const DESCRIPTIVE_BODY_MIN_CHARS = 120;
/** A title shorter than this (or a generic word) is "trivial". */
export const TRIVIAL_TITLE_MAX_CHARS = 10;
