import type { IntentConfidence } from "@devdigest/shared";

/** Badge tone per derived-intent confidence (IntentCard on Overview, IntentLine on Findings). */
export const INTENT_CONFIDENCE_TONE: Record<IntentConfidence, { color: string; bg: string }> = {
  low: { color: "var(--warn)", bg: "var(--warn-bg)" },
  medium: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
};
