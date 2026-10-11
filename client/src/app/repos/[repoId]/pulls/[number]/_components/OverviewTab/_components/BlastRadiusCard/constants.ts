import { Icon } from "@devdigest/ui";
import type { BlastStats } from "@devdigest/shared";

/** Order of the counts in the summary row (keys of `BlastStats` and of `blast.stat.*`). */
export const STAT_KEYS = [
  "symbols",
  "callers",
  "endpoints",
  "crons",
] as const satisfies readonly (keyof BlastStats)[];

/** Icon shown before each count in the summary row. */
export const STAT_ICONS = {
  symbols: Icon.Code,
  callers: Icon.Users,
  endpoints: Icon.Globe,
  crons: Icon.Clock,
} as const satisfies Record<keyof BlastStats, unknown>;

/** How long Resync waits for a new index state before giving up (the job may never write one). */
export const RESYNC_TIMEOUT_MS = 120_000;
