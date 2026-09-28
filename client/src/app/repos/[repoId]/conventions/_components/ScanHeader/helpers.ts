/** Drop reasons the server reports (convention_scans.dropped) that have a label. */
const KNOWN_REASONS = [
  "unverified_evidence",
  "low_adherence",
  "already_decided",
  "duplicate",
  "empty_rule",
] as const;

export type DropReason = (typeof KNOWN_REASONS)[number];

/** Non-zero drop counts, in a fixed order; unknown reasons are ignored. */
export function droppedEntries(dropped: Record<string, number>): [DropReason, number][] {
  return KNOWN_REASONS.flatMap((r) => ((dropped[r] ?? 0) > 0 ? [[r, dropped[r]!] as [DropReason, number]] : []));
}
