import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_LEVELS, SEVERITY_ORDER } from "./constants";

/** Findings per severity (0 for levels with none) — drives the filter chips. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(SEVERITY_LEVELS.map((sv) => [sv, 0])) as Record<Severity, number>;
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** Most severe first (CRITICAL → WARNING → SUGGESTION); stable within a level. */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Optionally keep one severity, drop low-confidence findings, sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (severity) shown = shown.filter((f) => f.severity === severity);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return sortBySeverity(shown);
}
