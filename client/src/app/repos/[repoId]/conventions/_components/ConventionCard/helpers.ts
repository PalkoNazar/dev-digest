import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_MID } from "../../constants";

/** Bar colour for a 0–1 confidence: green / amber / red. */
export function confidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_HIGH) return "var(--ok)";
  if (confidence >= CONFIDENCE_MID) return "var(--warn)";
  return "var(--crit)";
}

/** What the card can say about adherence, from what the server measured. */
export type AdherenceParts =
  | { kind: "measured"; percent: number; support: number; total: number }
  | { kind: "support"; count: number }
  | { kind: "none" };

export function adherenceParts(c: ConventionCandidate): AdherenceParts {
  if (c.adherence != null && c.support_files != null) {
    return {
      kind: "measured",
      percent: Math.round(c.adherence * 100),
      support: c.support_files,
      total: c.support_files + (c.violation_files ?? 0),
    };
  }
  if (c.support_files != null) return { kind: "support", count: c.support_files };
  return { kind: "none" };
}
