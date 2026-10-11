/* Review findings in the DiffViewer (Files changed tab, Smart Diff).
   The viewer never imports the app's FindingCard: the caller renders a finding
   through `renderFinding` (like DiffCommentApi for comments). */
import type { CSSProperties, ReactNode } from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countsAsFinding } from "@/lib/smart-diff";
import { lineKey } from "./comments";

/** What the viewer needs to show review findings inline. */
export interface DiffFindingApi {
  /** Findings of the latest reviews (dismissed included — shown muted, not counted). */
  findings: FindingRecord[];
  /** When false, finding cards, line labels and the unmatched block are hidden (the file dot stays). */
  show: boolean;
  renderFinding: (f: FindingRecord) => ReactNode;
  /** Short line-marker label for a severity (CRITICAL → "blocker", …). */
  severityLabel: (s: Severity) => string;
}

/** Most severe first. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** A finding anchors to the new-side line it starts on. */
export function findingKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Split a file's findings into those whose start line is rendered in the patch
 * (keyed) and the rest, shown in a block at the end of the file.
 */
export function partitionFindings(
  findings: readonly FindingRecord[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, FindingRecord[]>; unmatched: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unmatched: FindingRecord[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unmatched.push(f);
    }
  }
  return { matched, unmatched };
}

/** Most severe non-dismissed severity; if all are dismissed, the most severe of all. */
export function topSeverity(findings: readonly FindingRecord[]): Severity | null {
  const active = findings.filter(countsAsFinding);
  const pool = active.length > 0 ? active : findings;
  let top: Severity | null = null;
  for (const f of pool) {
    if (top === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}

// ---- styles (colours come from the SEV tokens at the call site) ----
export const fs = {
  /** Left severity stripe on a line row (inset shadow: no layout shift). */
  stripe: (color: string): CSSProperties => ({ boxShadow: `inset 3px 0 0 ${color}` }),
  label: (color: string, bg: string): CSSProperties => ({
    alignSelf: "center",
    flexShrink: 0,
    marginRight: 10,
    padding: "0 6px",
    borderRadius: 4,
    fontSize: 11,
    lineHeight: "16px",
    fontWeight: 600,
    color,
    background: bg,
  }),
  dot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }),
} as const;
