import type { Severity, SeverityCounts } from "@devdigest/shared";

/** Severity levels in display order, with their key in `PrMeta.findings_count`. */
export const LEVELS: { sev: Severity; key: keyof SeverityCounts }[] = [
  { sev: "CRITICAL", key: "critical" },
  { sev: "WARNING", key: "warning" },
  { sev: "SUGGESTION", key: "suggestion" },
];

/** Hover card geometry (px). */
export const CARD_WIDTH = 400;
export const CARD_MAX_HEIGHT = 380;
export const CARD_GAP = 6;
/** Grace period to move the pointer from the cell into the card. */
export const CLOSE_DELAY_MS = 150;
