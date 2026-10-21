/**
 * PR Brief tunables (SPEC-03). Issue limits (`MAX_ISSUES`, `ISSUE_MAX_CHARS`) come
 * from `modules/_shared/pr-refs-constants.ts` (the Intent Layer limits, AC-88).
 */

/** The `FEATURE_MODELS` id whose setting picks the provider/model (AC-43). */
export const FEATURE_ID = 'risk_brief';
export const SYSTEM_PROMPT_TEMPLATE = 'brief.system.md';

/** Model input budget, estimated as ceil(chars / 4) (AC-44). */
export const MAX_INPUT_TOKENS = 8000;
/** Model output cap (AC-47). */
export const MAX_OUTPUT_TOKENS = 2000;
/** Our race on the one call (AC-68); the adapter's own timeout is this + the grace. */
export const LLM_TIMEOUT_MS = 90_000;
export const LLM_ADAPTER_GRACE_MS = 5_000;

/** Fixed input caps, applied before the budget (AC-90, AC-100). */
export const BODY_MAX_CHARS = 4000;
export const MAX_CALLER_FILES = 30;
/** A budget cut that would keep less than this of a text drops it instead. */
export const MIN_CUT_CHARS = 200;
/** Ends every text or list shortened for the input (AC-92). */
export const TRUNCATION_MARKER = '[… truncated by DevDigest]';

/** Output caps, asked for in the prompt and applied after grounding (AC-94–AC-96). */
export const MAX_RISKS = 6;
export const MAX_FOCUS = 8;
export const SUMMARY_MAX_CHARS = 600;
export const TITLE_MAX_CHARS = 120;
export const REASON_MAX_CHARS = 300;
/** Appended to a text cut at its output cap (AC-96). */
export const ELLIPSIS = '…';
