import type { ReviewRecord, SeverityCounts } from "@devdigest/shared";
import { CARD_GAP, CARD_MAX_HEIGHT, CARD_WIDTH } from "./constants";

export function totalFindings(c: SeverityCounts): number {
  return c.critical + c.warning + c.suggestion;
}

/** The PR's latest `review` — the same one the server counts for the list. */
export function latestReview(reviews: ReviewRecord[]): ReviewRecord | undefined {
  let latest: ReviewRecord | undefined;
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    if (!latest || Date.parse(r.created_at) > Date.parse(latest.created_at)) latest = r;
  }
  return latest;
}

/**
 * Fixed-position coords for the hover card next to `anchor`: below it when it
 * fits, else above; kept inside the viewport horizontally.
 */
export function cardPosition(
  anchor: Pick<DOMRect, "left" | "top" | "bottom">,
  viewport: { width: number; height: number },
): { left: number; top?: number; bottom?: number } {
  const left = Math.max(8, Math.min(anchor.left, viewport.width - CARD_WIDTH - 8));
  const fitsBelow = anchor.bottom + CARD_GAP + CARD_MAX_HEIGHT <= viewport.height;
  return fitsBelow
    ? { left, top: anchor.bottom + CARD_GAP }
    : { left, bottom: viewport.height - anchor.top + CARD_GAP };
}
