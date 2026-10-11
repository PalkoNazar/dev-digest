import type { Severity } from '@devdigest/shared';

/** Server `instructions`: always in the client's context, so ≤ 400 chars (surface test). */
export const SERVER_INSTRUCTIONS =
  'DevDigest: local AI pull-request reviewer. Tools list reviewer agents, run a review on an ' +
  'imported PR and return its findings, read past findings, and read a repo\'s accepted coding ' +
  'conventions. Address PRs as repo "owner/name" + pr number. Needs the DevDigest API running ' +
  '(./scripts/dev.sh).';

/** Default max items per list (findings per review, conventions). */
export const DEFAULT_LIMIT = 20;

/** Lowest severity included by default. */
export const DEFAULT_MIN_SEVERITY: Severity = 'WARNING';

/** Lower = more severe; used to filter by `min_severity` and to sort. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** Hint added when a findings list is cut at `limit`. */
export const FINDINGS_TRUNCATED_HINT = 'raise limit or filter by min_severity';

/** Hint added when a review's findings are cut by the size budget (raising `limit` won't help). */
export const FINDINGS_BUDGET_HINT =
  'size cap reached: filter by min_severity or agent, or lower limit with detail="full"';

/**
 * Max minified-JSON chars of ONE review in a tool result (incl. run/verdict metadata and
 * `more`/`hint`). Findings that don't fit are counted in `more`; at least one is always kept.
 */
export const REVIEW_RESULT_BUDGET_CHARS = { concise: 4_000, full: 16_000 } as const;

/** Hint added when a conventions list is cut at `limit`. */
export const CONVENTIONS_TRUNCATED_HINT = 'raise limit';

/** How often `run_agent_on_pr` polls the run status. */
export const RUN_POLL_INTERVAL_MS = 3_000;

/** How often a progress notification is sent while waiting for a run. */
export const RUN_PROGRESS_EVERY_MS = 10_000;

/** Give up waiting (the run keeps going on the server) after this long. */
export const RUN_WAIT_TIMEOUT_MS = 15 * 60_000;

/** Most repo names listed in a "repo not found" error. */
export const MAX_KNOWN_REPOS_IN_ERROR = 10;

/** Concise findings cut `title` to this many chars (`detail: "full"` keeps it whole). */
export const CONCISE_TITLE_MAX = 80;

/**
 * Max minified-JSON chars of a `get_blast_radius` result (incl. summary, stats and
 * `more`/`hint`). Symbols that don't fit are counted in `more`; at least one is always kept.
 */
export const BLAST_RESULT_BUDGET_CHARS = 4_000;

/** Hint added when the blast map comes from an incomplete repo-intel index. */
export const BLAST_DEGRADED_HINT = 'index incomplete: resync the repo in the DevDigest UI';

/** Hint added when downstream symbols are cut by the size budget. */
export const BLAST_BUDGET_HINT =
  'size cap reached: see the full map on the PR Overview tab in the DevDigest UI';
